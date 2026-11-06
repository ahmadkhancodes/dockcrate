import { open } from "node:fs/promises";
import { env, entraClientId } from "@/lib/env";
import type { FileEncryptionInfo } from "@/lib/intunewin";
import { envCredentialSigner } from "./credential";
import {
  GraphConsentError, GraphError,
  type ContentFileState, type DetectionRule, type GraphAssignment, type GraphClient, type GraphFactory, type InstallSummary, type Win32AppBody,
} from "./types";

const GRAPH = "https://graph.microsoft.com/beta";
const LOGIN = "https://login.microsoftonline.com";
const BLOCK = 6 * 1024 * 1024;
const CONSENT_LOST = /AADSTS(7000112|700016|65001|650051|500011)|invalid_client|unauthorized_client/;

type Fetch = typeof fetch;
export interface RealGraphOptions {
  entraTenantId: string;
  clientId: string;
  /** Returns a client assertion JWT, or null to use the client secret. */
  assertion?: (a: { clientId: string; tokenEndpoint: string }) => string;
  clientSecret?: string;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ruleBody = (r: DetectionRule): Record<string, unknown> => {
  switch (r.kind) {
    case "msiProductCode":
      return { "@odata.type": "#microsoft.graph.win32LobAppProductCodeRule", productCode: r.productCode, ...(r.productVersion ? { productVersionOperator: "equal", productVersion: r.productVersion } : { productVersionOperator: "notConfigured" }) };
    case "registry":
      return { "@odata.type": "#microsoft.graph.win32LobAppRegistryRule", ruleType: "detection", check32BitOn64System: false, keyPath: r.keyPath, valueName: r.valueName, operationType: "version", operator: r.operator, comparisonValue: r.comparisonValue };
    case "file":
      return { "@odata.type": "#microsoft.graph.win32LobAppFileSystemRule", ruleType: "detection", check32BitOn64System: false, path: r.path, fileOrFolderName: r.fileOrFolderName, operationType: "version", operator: r.operator, comparisonValue: r.comparisonValue };
  }
};

/** Minimal Graph wrapper on fetch: client credentials per tenant, token cache, Retry-After and backoff on 429/5xx. */
export class RealGraphClient implements GraphClient {
  private token: { value: string; exp: number } | null = null;
  private readonly f: Fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly o: RealGraphOptions) {
    this.f = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? wait;
  }

  async accessToken(now = Date.now()): Promise<string> {
    if (this.token && this.token.exp > now + 60_000) return this.token.value;
    const tokenEndpoint = `${LOGIN}/${this.o.entraTenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({ client_id: this.o.clientId, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" });
    if (this.o.assertion) {
      body.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
      body.set("client_assertion", this.o.assertion({ clientId: this.o.clientId, tokenEndpoint }));
    } else if (this.o.clientSecret) body.set("client_secret", this.o.clientSecret);
    const res = await this.f(tokenEndpoint, { method: "POST", body });
    const text = await res.text();
    if (!res.ok) {
      if (CONSENT_LOST.test(text)) throw new GraphConsentError();
      throw new GraphError(res.status, "token_request_failed");
    }
    const j = JSON.parse(text) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, exp: now + (j.expires_in - 300) * 1000 };
    return j.access_token;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const max = this.o.maxRetries ?? 5;
    for (let attempt = 0; ; attempt++) {
      const res = await this.f(`${GRAPH}${path}`, {
        method,
        headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return (res.status === 204 ? undefined : await res.json().catch(() => undefined)) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < max) {
        const ra = Number(res.headers.get("retry-after"));
        await this.sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 2 ** attempt * 500 + Math.random() * 250));
        continue;
      }
      const text = await res.text().catch(() => "");
      if ((res.status === 401 || res.status === 403) && CONSENT_LOST.test(text)) throw new GraphConsentError();
      throw new GraphError(res.status, `graph_${method}_${path.split("?")[0]}_${res.status}`);
    }
  }

  async getOrganization() {
    const r = await this.req<{ value: { id: string; displayName: string }[] }>("GET", "/organization?$select=id,displayName");
    const o = r.value[0];
    if (!o) throw new GraphError(404, "organization_not_found");
    return { id: o.id, displayName: o.displayName };
  }

  async listGroups() {
    const r = await this.req<{ value: { id: string; displayName: string }[] }>("GET", "/groups?$select=id,displayName&$top=200&$orderby=displayName");
    return r.value;
  }

  async createWin32App(b: Win32AppBody) {
    const r = await this.req<{ id: string }>("POST", "/deviceAppManagement/mobileApps", {
      "@odata.type": "#microsoft.graph.win32LobApp",
      displayName: b.displayName, description: b.description, publisher: b.publisher, displayVersion: b.displayVersion, notes: b.notes,
      isFeatured: false, privacyInformationUrl: null, informationUrl: null, owner: "DockCrate by BufferSol", developer: b.publisher,
      installCommandLine: b.installCommandLine, uninstallCommandLine: b.uninstallCommandLine, fileName: b.fileName, setupFilePath: b.setupFilePath,
      applicableArchitectures: "x64", minimumSupportedWindowsRelease: b.minimumSupportedWindowsRelease,
      installExperience: { runAsAccount: b.installExperience.runAsAccount, deviceRestartBehavior: b.installExperience.deviceRestartBehavior, maxRunTimeInMinutes: 60 },
      returnCodes: b.returnCodes, rules: b.detectionRules.map(ruleBody), msiInformation: null,
    });
    return { id: r.id };
  }

  async createContentVersion(appId: string) {
    return this.req<{ id: string }>("POST", `/deviceAppManagement/mobileApps/${appId}/microsoft.graph.win32LobApp/contentVersions`, {});
  }

  async createContentFile(appId: string, cv: string, f: { name: string; size: number; sizeEncrypted: number }) {
    return this.req<{ id: string }>("POST", `/deviceAppManagement/mobileApps/${appId}/microsoft.graph.win32LobApp/contentVersions/${cv}/files`, {
      "@odata.type": "#microsoft.graph.mobileAppContentFile", name: f.name, size: f.size, sizeEncrypted: f.sizeEncrypted, manifest: null, isDependency: false,
    });
  }

  async getContentFile(appId: string, cv: string, fileId: string): Promise<ContentFileState> {
    return this.req<ContentFileState>("GET", `/deviceAppManagement/mobileApps/${appId}/microsoft.graph.win32LobApp/contentVersions/${cv}/files/${fileId}`);
  }

  /** Put Block (6 MB) then Put Block List against the SAS URI. Block ids are deterministic so a retry overwrites cleanly. */
  async uploadToStorage(sasUri: string, payloadPath: string) {
    const h = await open(payloadPath, "r");
    try {
      const size = (await h.stat()).size;
      const ids: string[] = [];
      for (let off = 0, i = 0; off < size; off += BLOCK, i++) {
        const len = Math.min(BLOCK, size - off);
        const buf = Buffer.alloc(len);
        await h.read(buf, 0, len, off);
        const id = Buffer.from(String(i).padStart(6, "0")).toString("base64");
        ids.push(id);
        const r = await this.f(`${sasUri}&comp=block&blockid=${encodeURIComponent(id)}`, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob" }, body: new Uint8Array(buf) });
        if (!r.ok) throw new GraphError(r.status, "blob_put_block_failed");
      }
      const xml = `<?xml version="1.0" encoding="utf-8"?><BlockList>${ids.map((id) => `<Latest>${id}</Latest>`).join("")}</BlockList>`;
      const r = await this.f(`${sasUri}&comp=blocklist`, { method: "PUT", headers: { "content-type": "text/plain; charset=UTF-8" }, body: xml });
      if (!r.ok) throw new GraphError(r.status, "blob_put_block_list_failed");
    } finally {
      await h.close();
    }
  }

  async commitContentFile(appId: string, cv: string, fileId: string, info: FileEncryptionInfo) {
    await this.req("POST", `/deviceAppManagement/mobileApps/${appId}/microsoft.graph.win32LobApp/contentVersions/${cv}/files/${fileId}/commit`, { fileEncryptionInfo: info });
  }

  async setCommittedContentVersion(appId: string, cv: string) {
    await this.req("PATCH", `/deviceAppManagement/mobileApps/${appId}`, { "@odata.type": "#microsoft.graph.win32LobApp", committedContentVersion: cv });
  }

  async assignApp(appId: string, assignments: GraphAssignment[]) {
    await this.req("POST", `/deviceAppManagement/mobileApps/${appId}/assign`, {
      mobileAppAssignments: assignments.map((a) => ({
        "@odata.type": "#microsoft.graph.mobileAppAssignment",
        intent: a.intent,
        target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: a.groupId },
        settings: { "@odata.type": "#microsoft.graph.win32LobAppAssignmentSettings", notifications: "showAll", deliveryOptimizationPriority: "notConfigured" },
      })),
    });
  }

  async getInstallSummary(appId: string): Promise<InstallSummary> {
    const r = await this.req<{ installedDeviceCount?: number; failedDeviceCount?: number; pendingInstallDeviceCount?: number }>("GET", `/deviceAppManagement/mobileApps/${appId}/installSummary`);
    return { installed: r.installedDeviceCount ?? 0, failed: r.failedDeviceCount ?? 0, pending: r.pendingInstallDeviceCount ?? 0 };
  }

  async findAppsByName(name: string) {
    const filter = `isof('microsoft.graph.win32LobApp') and displayName eq '${name.replace(/'/g, "''")}'`;
    const r = await this.req<{ value: { id: string }[] }>("GET", `/deviceAppManagement/mobileApps?$filter=${encodeURIComponent(filter)}&$select=id&$top=20`);
    return r.value.map((x) => ({ id: x.id }));
  }

  async deleteApp(appId: string) {
    await this.req("DELETE", `/deviceAppManagement/mobileApps/${appId}`);
  }
}

export class RealGraphFactory implements GraphFactory {
  forTenant(entraTenantId: string): GraphClient {
    const e = env();
    const clientId = entraClientId(e);
    if (!clientId) throw new Error("entra_not_configured");
    const certKey = e.ENTRA_CLIENT_CERT_PRIVATE_KEY_PEM;
    return new RealGraphClient({
      entraTenantId, clientId,
      ...(certKey ? { assertion: (a: { clientId: string; tokenEndpoint: string }) => envCredentialSigner(e).signAssertion(a) } : { clientSecret: e.ENTRA_CLIENT_SECRET }),
    });
  }
}

