import { readFile } from "node:fs/promises";
import type { FileEncryptionInfo } from "@/lib/intunewin";
import { GraphConsentError, type ContentFileState, type GraphAssignment, type GraphClient, type GraphFactory, type InstallSummary, type TenantOrganization, type Win32AppBody } from "./types";

export interface FakeApp {
  id: string;
  body: Win32AppBody;
  contentVersions: Map<string, { files: Map<string, { name: string; size: number; sizeEncrypted: number; state: ContentFileState["uploadState"]; sasUri: string; info?: FileEncryptionInfo; uploaded?: number }> }>;
  committedContentVersion: string | null;
  assignments: GraphAssignment[];
  assignHistory: GraphAssignment[][];
}

export interface FakeTenantOptions {
  organization?: TenantOrganization;
  /** Consent not granted yet: every call throws GraphConsentError. */
  consent?: boolean;
}

/** In-memory Graph for tests and stub mode. Records every call so tests can assert the upload sequence. */
export class FakeGraphClient implements GraphClient {
  readonly calls: string[] = [];
  readonly apps = new Map<string, FakeApp>();
  /** Install results the ring tick reads, keyed by app id. */
  readonly summaries = new Map<string, InstallSummary>();
  consent: boolean;
  organization: TenantOrganization;
  /** Fail the next N calls of the named method (to test resume). */
  failNext = new Map<string, number>();
  private n = 0;
  private polled = new Set<string>();

  constructor(opts: FakeTenantOptions = {}) {
    this.consent = opts.consent ?? true;
    this.organization = opts.organization ?? { id: "fake-tenant", displayName: "Fake tenant" };
  }

  private id(prefix: string) {
    return `${prefix}-${++this.n}`;
  }

  private enter(name: string) {
    this.calls.push(name);
    if (!this.consent) throw new GraphConsentError();
    const left = this.failNext.get(name) ?? 0;
    if (left > 0) {
      this.failNext.set(name, left - 1);
      throw new Error(`injected_failure:${name}`);
    }
  }

  private app(id: string) {
    const a = this.apps.get(id);
    if (!a) throw new Error(`app_not_found:${id}`);
    return a;
  }

  async getOrganization() {
    this.enter("getOrganization");
    return this.organization;
  }
  groups: { id: string; displayName: string }[] = [{ id: "g-pilot", displayName: "DC-Pilot" }, { id: "g-broad", displayName: "DC-Broad" }];
  async listGroups() {
    this.enter("listGroups");
    return this.groups;
  }
  async createWin32App(body: Win32AppBody) {
    this.enter("createWin32App");
    const id = this.id("app");
    this.apps.set(id, { id, body, contentVersions: new Map(), committedContentVersion: null, assignments: [], assignHistory: [] });
    return { id };
  }
  async createContentVersion(appId: string) {
    this.enter("createContentVersion");
    const id = this.id("cv");
    this.app(appId).contentVersions.set(id, { files: new Map() });
    return { id };
  }
  async createContentFile(appId: string, cv: string, file: { name: string; size: number; sizeEncrypted: number }) {
    this.enter("createContentFile");
    const id = this.id("file");
    this.app(appId).contentVersions.get(cv)!.files.set(id, { ...file, state: "azureStorageUriRequestPending", sasUri: `https://fake.blob.core.windows.net/${id}?sig=fake` });
    return { id };
  }
  async getContentFile(appId: string, cv: string, fileId: string): Promise<ContentFileState> {
    this.enter("getContentFile");
    const f = this.app(appId).contentVersions.get(cv)!.files.get(fileId)!;
    // The SAS URI shows up on the first poll after creation (one pending poll, like the real service).
    if (f.state === "azureStorageUriRequestPending") {
      if (this.polled.has(fileId)) f.state = "azureStorageUriRequestSuccess";
      else this.polled.add(fileId);
    }
    return { uploadState: f.state, azureStorageUri: f.state === "azureStorageUriRequestSuccess" ? f.sasUri : undefined };
  }
  async uploadToStorage(sasUri: string, payloadPath: string) {
    this.enter("uploadToStorage");
    const bytes = (await readFile(payloadPath)).length;
    for (const a of this.apps.values())
      for (const cv of a.contentVersions.values()) for (const f of cv.files.values()) if (f.sasUri === sasUri) f.uploaded = bytes;
  }
  async commitContentFile(appId: string, cv: string, fileId: string, info: FileEncryptionInfo) {
    this.enter("commitContentFile");
    const f = this.app(appId).contentVersions.get(cv)!.files.get(fileId)!;
    if (f.uploaded !== f.sizeEncrypted) {
      f.state = "commitFileFailed";
      return;
    }
    f.info = info;
    f.state = "commitFileSuccess";
  }
  async setCommittedContentVersion(appId: string, cv: string) {
    this.enter("setCommittedContentVersion");
    this.app(appId).committedContentVersion = cv;
  }
  async assignApp(appId: string, assignments: GraphAssignment[]) {
    this.enter("assignApp");
    const a = this.app(appId);
    a.assignments = assignments.map((x) => ({ ...x }));
    a.assignHistory.push(a.assignments);
  }
  async getInstallSummary(appId: string) {
    this.enter("getInstallSummary");
    return this.summaries.get(appId) ?? { installed: 0, failed: 0, pending: 0 };
  }
  async deleteApp(appId: string) {
    this.enter("deleteApp");
    this.apps.delete(appId);
  }
}

/** One fake client per Entra tenant id, created on demand. */
export class FakeGraphFactory implements GraphFactory {
  readonly clients = new Map<string, FakeGraphClient>();
  forTenant(entraTenantId: string): FakeGraphClient {
    let c = this.clients.get(entraTenantId);
    if (!c) this.clients.set(entraTenantId, (c = new FakeGraphClient({ organization: { id: entraTenantId, displayName: `Tenant ${entraTenantId.slice(0, 8)}` } })));
    return c;
  }
}
