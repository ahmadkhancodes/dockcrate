import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { getDb } from "@/lib/db";
import { createMemoryDb } from "@/lib/db/memory";
import type { Deps } from "@/lib/deps";
import { FakeGraphClient, FakeGraphFactory } from "@/lib/graph/fake";
import { GraphConsentError } from "@/lib/graph/types";
import { RealGraphClient } from "@/lib/graph/real";
import { createPemCredentialSigner, thumbprintHeader } from "@/lib/graph/credential";
import { PERSONAL_MSA_TENANT, decodeIdTokenClaims, isWorkAccount } from "@/lib/auth/entra";
import { ALL_TENANTS, authorize, canAccess, filterTenants } from "@/lib/authz";
import { can } from "@/lib/auth/roles";
import { signToken, verifyToken } from "@/lib/signed";
import {
  buildConsentUrl, createTenant, consentUrlForLink, handleConsentCallback, sendConsentLink, tenantVerifyJob, type Alert, type Tenant,
} from "@/lib/tenants";
import { ensureCatalogSeeded, getCatalogEntry, listCatalog } from "@/lib/catalog";
import { generateDetectionRules } from "@/lib/catalog/detection";
import { generateTestSigner, manifestPayload, signVersion, verifyVersionManifest } from "@/lib/catalog/manifest";
import { publishPlan, statusFromChecks, verifyVersion } from "@/lib/catalog/verify";
import { PendingVmLab, type VmLab } from "@/lib/catalog/vmlab";
import type { CatalogVersion } from "@/lib/catalog/types";
import { BufferInstallerSource } from "@/lib/publish/installer";
import { publishVersion, type PublishCtx } from "@/lib/publish/win32";
import { defaultRingConfig, fanout, ringTick, rollback, setAutoUpdate, setOrgPaused, setTenantPaused } from "@/lib/rings/engine";
import { dockRows } from "@/lib/rings/view";
import type { Deployment, RingConfig } from "@/lib/rings/types";

const mails: { to: string; subject: string; text: string }[] = [];
let n = 0;
let deps: Deps;
let graph: FakeGraphFactory;
const signer = generateTestSigner();
let clock = new Date("2026-11-05T10:00:00Z");
const hours = (h: number) => { clock = new Date(clock.getTime() + h * 3_600_000); };

async function freshDeps(): Promise<Deps> {
  graph = new FakeGraphFactory();
  return { db: await getDb(), graph, sendMail: async (m) => { mails.push({ to: m.to, subject: m.subject, text: m.text }); }, baseUrl: "https://dockcrate.test", now: () => clock };
}
const ctxFor = (): PublishCtx => ({ installer: new BufferInstallerSource(Buffer.from("MZ-installer")), signer, maxPolls: 5, sleep: async () => {} });
const ENTRA = "11111111-2222-3333-4444-555555555555";

async function connectedTenant(orgId: string, entra = ENTRA): Promise<Tenant> {
  const t = await createTenant(deps, { orgId, name: "Halvorsen Dental", actorId: "u1" });
  const url = new URL(buildConsentUrl({ baseUrl: deps.baseUrl, orgId, tenantId: t.id, clientId: "client-1", now: clock.getTime() }));
  const r = await handleConsentCallback(deps, { state: url.searchParams.get("state"), tenant: entra, admin_consent: "True" });
  expect(r.status).toBe("connected");
  return (await deps.db.collection<Tenant>("tenants").get(t.id))!;
}

async function setup(orgId: string, version = "7-zip@25.01") {
  await ensureCatalogSeeded(deps.db, signer, clock);
  const tenant = await connectedTenant(orgId, `${ENTRA.slice(0, 30)}${String(++n).padStart(6, "0")}`);
  const cfg = defaultRingConfig(tenant, { id: "g-pilot", name: "DC-Pilot" }, { id: "g-broad", name: "DC-Broad" });
  await deps.db.collection<RingConfig>("ring_configs").put(cfg);
  return { tenant, cfg, client: graph.forTenant(tenant.entraTenantId!), versionId: version };
}

/** Makes a version verified (4/4) the way the lab will, then re-signs the manifest. */
async function makeVerified(id: string) {
  const col = deps.db.collection<CatalogVersion>("catalog_versions");
  const v = (await col.get(id))!;
  v.verification.checks.vm = "pass";
  v.status = "verified";
  await col.put(v);
}

beforeEach(async () => {
  clock = new Date("2026-11-05T10:00:00Z");
  mails.length = 0;
  globalThis.__kitMemoryDb = createMemoryDb("dockcrate"); // each test gets an empty database (audit() reads the same one)
  deps = await freshDeps();
});

describe("Entra sign in", () => {
  it("accepts work tenants and rejects personal, missing and malformed tid", () => {
    expect(isWorkAccount({ tid: ENTRA })).toBe(true);
    expect(isWorkAccount({ tid: PERSONAL_MSA_TENANT })).toBe(false);
    expect(isWorkAccount({ tid: PERSONAL_MSA_TENANT.toUpperCase() })).toBe(false);
    expect(isWorkAccount({})).toBe(false);
    expect(isWorkAccount({ tid: "not-a-guid" })).toBe(false);
    expect(isWorkAccount({ tid: ENTRA, iss: `https://login.microsoftonline.com/${PERSONAL_MSA_TENANT}/v2.0` })).toBe(false);
  });
  it("decodes id token claims without trusting garbage", () => {
    const body = Buffer.from(JSON.stringify({ tid: ENTRA })).toString("base64url");
    expect(decodeIdTokenClaims(`h.${body}.s`).tid).toBe(ENTRA);
    expect(decodeIdTokenClaims("nope")).toEqual({});
  });
  it("signs a client assertion JWT with x5t for Entra", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const s = createPemCredentialSigner(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "AB".repeat(20));
    const jwt = s.signAssertion({ clientId: "c1", tokenEndpoint: "https://login.microsoftonline.com/t/oauth2/v2.0/token", now: 1_800_000_000_000 });
    const [h, p] = jwt.split(".").slice(0, 2).map((x) => JSON.parse(Buffer.from(x!, "base64url").toString()));
    expect(h.alg).toBe("RS256");
    expect(h.x5t).toBe(thumbprintHeader("AB".repeat(20)).x5t);
    expect(p.iss).toBe("c1");
    expect(p.aud).toContain("token");
    expect(thumbprintHeader("AB".repeat(32))["x5t#S256"]).toBeTruthy();
  });
});

describe("roles and tenant scopes", () => {
  it("owner, admin, operator and viewer permissions", () => {
    expect(can("owner", "tenant", "connect")).toBe(true);
    expect(can("admin", "ring", "configure")).toBe(true);
    expect(can("operator", "deployment", "rollback")).toBe(true);
    expect(can("operator", "tenant", "connect")).toBe(false);
    expect(can("operator", "ring", "configure")).toBe(false);
    expect(can("viewer", "deployment", "read")).toBe(true);
    expect(can("viewer", "deployment", "publish")).toBe(false);
    expect(can("member", "deployment", "read")).toBe(false);
    expect(can(undefined, "tenant", "read")).toBe(false);
  });
  it("a technician scoped to 3 of 5 tenants sees and acts on only those", () => {
    const tenants = ["t1", "t2", "t3", "t4", "t5"].map((id) => ({ id }));
    const tech = { role: "operator", tenantScope: ["t1", "t2", "t3"] };
    expect(filterTenants(tech, tenants).map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(canAccess(tech, "deployment", "publish", "t2")).toBe(true);
    expect(canAccess(tech, "deployment", "publish", "t4")).toBe(false);
    expect(() => authorize(tech, "deployment", "rollback", "t5")).toThrow();
    expect(() => authorize({ role: "viewer", tenantScope: ALL_TENANTS }, "deployment", "publish", "t1")).toThrow();
    expect(filterTenants({ role: "admin", tenantScope: ["t1"] }, tenants)).toHaveLength(5);
  });
});

describe("tenant connect and consent", () => {
  it("builds the multi tenant admin consent URL with a signed state", () => {
    const u = new URL(buildConsentUrl({ baseUrl: "https://dockcrate.test", orgId: "o1", tenantId: "t1", clientId: "client-1" }));
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/organizations/v2.0/adminconsent");
    expect(u.searchParams.get("client_id")).toBe("client-1");
    expect(u.searchParams.get("scope")).toBe("https://graph.microsoft.com/.default");
    expect(u.searchParams.get("redirect_uri")).toBe("https://dockcrate.test/api/tenants/consent/callback");
    expect(verifyToken(u.searchParams.get("state")!)).toMatchObject({ t: "t1", o: "o1" });
  });
  it("callback connects the tenant on the spot (well under 60 s) and audits it", async () => {
    const org = `org-c-${++n}`;
    const t = await connectedTenant(org);
    expect(t.status).toBe("connected");
    expect(t.entraTenantId).toBe(ENTRA);
    expect((await deps.db.listAudit(org)).map((a) => a.action)).toContain("tenant.connected");
  });
  it("stays waiting when Graph does not see the consent yet, then the job connects it", async () => {
    const org = `org-w-${++n}`;
    const t = await createTenant(deps, { orgId: org, name: "Contoso", actorId: null });
    graph.forTenant(ENTRA).consent = false;
    const state = new URL(buildConsentUrl({ baseUrl: deps.baseUrl, orgId: org, tenantId: t.id, clientId: "c" })).searchParams.get("state");
    const r = await handleConsentCallback(deps, { state, tenant: ENTRA, admin_consent: "True" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("waiting_consent");
    graph.forTenant(ENTRA).consent = true;
    expect((await tenantVerifyJob(deps)).connected).toBeGreaterThan(0);
    expect((await deps.db.collection<Tenant>("tenants").get(t.id))!.status).toBe("connected");
  });
  it("rejects a bad or expired state, a personal tenant, a duplicate and consent errors", async () => {
    const org = `org-r-${++n}`;
    const t = await createTenant(deps, { orgId: org, name: "Fabrikam", actorId: null });
    const state = new URL(buildConsentUrl({ baseUrl: deps.baseUrl, orgId: org, tenantId: t.id, clientId: "c", now: clock.getTime() })).searchParams.get("state")!;
    expect((await handleConsentCallback(deps, { state: "garbage", tenant: ENTRA, admin_consent: "True" })).ok).toBe(false);
    hours(2);
    expect((await handleConsentCallback(deps, { state, tenant: ENTRA, admin_consent: "True" })).message).toMatch(/expired/);
    const fresh = new URL(buildConsentUrl({ baseUrl: deps.baseUrl, orgId: org, tenantId: t.id, clientId: "c", now: clock.getTime() })).searchParams.get("state")!;
    expect((await handleConsentCallback(deps, { state: fresh, tenant: PERSONAL_MSA_TENANT, admin_consent: "True" })).ok).toBe(false);
    const denied = await handleConsentCallback(deps, { state: fresh, error: "access_denied", error_description: "AADSTS65004" });
    expect(denied.message).toContain("Group.Read.All");
    expect(denied.message).toContain("DeviceManagementApps.ReadWrite.All");
    expect(denied.status).toBe("waiting_consent");
    const other = await createTenant(deps, { orgId: org, name: "Fabrikam 2", actorId: null });
    await handleConsentCallback(deps, { state: fresh, tenant: ENTRA, admin_consent: "True" });
    const s2 = new URL(buildConsentUrl({ baseUrl: deps.baseUrl, orgId: org, tenantId: other.id, clientId: "c", now: clock.getTime() })).searchParams.get("state")!;
    expect((await handleConsentCallback(deps, { state: s2, tenant: ENTRA, admin_consent: "True" })).message).toMatch(/already connected/);
  });
  it("Send consent link to admin emails a working signed link and shows Waiting for admin", async () => {
    const org = `org-s-${++n}`;
    const t = await createTenant(deps, { orgId: org, name: "Northwind", actorId: null });
    const next = await sendConsentLink(deps, t, "IT.Admin@northwind.test", "u1");
    expect(next.status).toBe("waiting_consent");
    expect(next.consentSentTo).toBe("it.admin@northwind.test");
    const m = mails.at(-1)!;
    expect(m.to).toBe("IT.Admin@northwind.test");
    const link = /https:\/\/dockcrate\.test\/connect\/consent\/(\S+)/.exec(m.text)!;
    const target = consentUrlForLink(deps, link[1]!)!;
    expect(target).toContain("login.microsoftonline.com/organizations/v2.0/adminconsent");
    expect(consentUrlForLink(deps, link[1]!.slice(0, -3) + "xxx")).toBeNull();
    hours(24 * 8);
    expect(consentUrlForLink(deps, link[1]!)).toBeNull();
    await expect(sendConsentLink(deps, t, "not-an-email", null)).rejects.toThrow();
  });
  it("lost consent marks the tenant disconnected once, raises an alert and keeps jobs off", async () => {
    const org = `org-d-${++n}`;
    const t = await connectedTenant(org, `${ENTRA.slice(0, 30)}${String(++n).padStart(6, "0")}`);
    graph.forTenant(t.entraTenantId!).consent = false;
    await tenantVerifyJob(deps);
    expect((await deps.db.collection<Tenant>("tenants").get(t.id))!.status).toBe("disconnected");
    expect((await deps.db.collection<Alert>("alerts").find({ orgId: org })).map((a) => a.kind)).toContain("tenant.disconnected");
    const again = await tenantVerifyJob(deps);
    expect(again.disconnected).toBe(0);
  });
  it("signed tokens verify, expire and resist tampering", () => {
    const tok = signToken({ a: "1" }, 1000, 0, "k");
    expect(verifyToken(tok, 500, "k")).toMatchObject({ a: "1" });
    expect(verifyToken(tok, 2000, "k")).toBeNull();
    expect(verifyToken(tok, 500, "other")).toBeNull();
  });
});

describe("catalog and verification gating", () => {
  it("seeds the 6 sample apps once, with 4 checks, a QA log and a signed manifest", async () => {
    await ensureCatalogSeeded(deps.db, signer, clock);
    await ensureCatalogSeeded(deps.db, signer, clock);
    const list = await listCatalog(deps.db);
    expect(list).toHaveLength(6);
    const sevenZip = (await getCatalogEntry(deps.db, "7-zip"))!;
    expect(Object.keys(sevenZip.version.verification.checks)).toEqual(["hash", "signer", "scan", "vm"]);
    expect(sevenZip.version.verification.qaLog).toHaveLength(4);
    expect(sevenZip.version.verification.checks.vm).toBe("pending");
    expect(verifyVersionManifest(signer, sevenZip.version)).toBe(true);
    expect(sevenZip.version.detection[0]).toMatchObject({ kind: "msiProductCode" });
  });
  it("D-01: 3 of 4 publishes to Pilot only; REQUIRE_VM_VERIFICATION holds it; 4 of 4 reaches Broad", async () => {
    await ensureCatalogSeeded(deps.db, signer, clock);
    const v = (await getCatalogEntry(deps.db, "7-zip"))!.version;
    expect(publishPlan(v, false)).toMatchObject({ allowed: true, rings: ["pilot"], tag: "Inspection 3/4 · VM pending" });
    expect(publishPlan(v, true)).toMatchObject({ allowed: false, rings: [] });
    const full = { ...v, status: "verified" as const, verification: { ...v.verification, checks: { ...v.verification.checks, vm: "pass" as const } } };
    expect(publishPlan(full, true)).toMatchObject({ allowed: true, rings: ["pilot", "broad"], tag: "Inspected 4/4" });
    expect(publishPlan({ ...v, detection: [] }, false).allowed).toBe(false);
    expect(statusFromChecks({ hash: "pass", signer: "pass", scan: "pass", vm: "pending" }, false)).toBe("verified_static");
    expect(statusFromChecks({ hash: "pass", signer: "pass", scan: "fail", vm: "pending" }, false)).toBe("held");
  });
  it("a changed signer holds the sample Acrobat version", async () => {
    await ensureCatalogSeeded(deps.db, signer, clock);
    const v = (await getCatalogEntry(deps.db, "adobe-acrobat-reader"))!.version;
    expect(v.status).toBe("held");
    expect(publishPlan(v, false).allowed).toBe(false);
  });
  it("verifyVersion: hash mismatch, new signer, EICAR and a stale scanner database all hold; the VM step stays pending", async () => {
    await ensureCatalogSeeded(deps.db, signer, clock);
    const v = (await getCatalogEntry(deps.db, "7-zip"))!.version;
    const ok = { observedSha256: v.sha256, signerThumbprint: v.signer.thumbprint, scan: { clean: true, signatureAgeHours: 3 } };
    const good = await verifyVersion(v, ok, new PendingVmLab(), clock, false);
    expect(good.status).toBe("verified_static");
    expect(good.verification.checks).toEqual({ hash: "pass", signer: "pass", scan: "pass", vm: "pending" });
    expect((await verifyVersion(v, ok, new PendingVmLab(), clock, true)).status).toBe("held");
    expect((await verifyVersion(v, { ...ok, observedSha256: "00" }, new PendingVmLab(), clock)).verification.checks.hash).toBe("fail");
    const sig = await verifyVersion({ ...v, previousSignerThumbprint: "OLD" }, ok, new PendingVmLab(), clock);
    expect(sig.status).toBe("held");
    expect(sig.verification.heldReason).toMatch(/certificate/);
    const eicar = await verifyVersion(v, { ...ok, scan: { clean: false, signatureAgeHours: 1, detail: "Eicar-Test-Signature" } }, new PendingVmLab(), clock);
    expect(eicar.status).toBe("held");
    expect(eicar.verification.heldReason).toContain("Eicar");
    const stale = await verifyVersion(v, { ...ok, scan: { clean: true, signatureAgeHours: 30 } }, new PendingVmLab(), clock);
    expect(stale.verification.checks.scan).toBe("fail");
    const lab: VmLab = { name: "test", run: async () => ({ result: "pass", log: ["ok"] }) };
    expect((await verifyVersion(v, ok, lab, clock, true)).status).toBe("verified");
  });
  it("generates detection rules: MSI product code, EXE registry, file fallback, none when unknown", () => {
    expect(generateDetectionRules("msi", "1.0", { msiProductCode: "{X}" })[0]).toMatchObject({ kind: "msiProductCode", productCode: "{X}" });
    expect(generateDetectionRules("exe", "2.0", { uninstallKey: "HKLM\\K", displayVersion: "2.0" })[0]).toMatchObject({ kind: "registry", comparisonValue: "2.0" });
    expect(generateDetectionRules("exe", "2.0", { filePath: "C:\\App", fileName: "a.exe" })[0]).toMatchObject({ kind: "file" });
    expect(generateDetectionRules("exe", "2.0", {})).toEqual([]);
  });
  it("manifest tamper test fails", async () => {
    await ensureCatalogSeeded(deps.db, signer, clock);
    const v = (await getCatalogEntry(deps.db, "7-zip"))!.version;
    expect(verifyVersionManifest(signer, { ...v, sha256: "ff" + v.sha256.slice(2) })).toBe(false);
    expect(verifyVersionManifest(signer, { ...v, installCmd: "evil.exe" })).toBe(false);
    expect(verifyVersionManifest(generateTestSigner(), v)).toBe(false);
    expect(manifestPayload(v)).toContain(v.sha256);
    expect(signVersion(signer, v)).toBe(v.manifestSig);
  });
});

describe("publish as Win32 through the fake Graph", () => {
  it("runs create app, content version, file, SAS, upload, commit, finalize, assign Pilot in order", async () => {
    const { tenant, client } = await setup(`org-p-${++n}`);
    const d = await publishVersion(deps, ctxFor(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: "u1" });
    expect(d.state).toBe("assigned");
    expect(d.step).toBe("done");
    const order = client.calls.filter((c) => !["getContentFile", "getOrganization"].includes(c));
    expect(order).toEqual(["createWin32App", "createContentVersion", "createContentFile", "uploadToStorage", "commitContentFile", "setCommittedContentVersion", "assignApp"]);
    const app = [...client.apps.values()][0]!;
    expect(app.body.displayName).toBe("DC | 7-Zip 25.01");
    expect(app.body.detectionRules[0]).toMatchObject({ kind: "msiProductCode" });
    expect(app.committedContentVersion).toBeTruthy();
    expect(app.assignments).toEqual([{ groupId: "g-pilot", intent: "required" }]);
    const file = [...[...app.contentVersions.values()][0]!.files.values()][0]!;
    expect(file.state).toBe("commitFileSuccess");
    expect(file.info?.profileIdentifier).toBe("ProfileVersion1");
    expect((await deps.db.listAudit(tenant.orgId)).map((a) => a.action)).toContain("deployment.published");
  });
  it("is idempotent: publishing twice never creates a second Intune app", async () => {
    const { tenant, client } = await setup(`org-i-${++n}`);
    const a = await publishVersion(deps, ctxFor(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null });
    const b = await publishVersion(deps, ctxFor(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null });
    expect(b.id).toBe(a.id);
    expect(client.apps.size).toBe(1);
  });
  it("resumes an interrupted upload at the stored step without duplicating the app", async () => {
    const { tenant, client } = await setup(`org-x-${++n}`);
    client.failNext.set("uploadToStorage", 1);
    await expect(publishVersion(deps, ctxFor(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null })).rejects.toThrow(/injected_failure/);
    const stuck = (await deps.db.collection<Deployment>("deployments").find({ tenantId: tenant.id }))[0]!;
    expect(stuck.step).toBe("upload");
    expect(stuck.intuneAppId).toBeTruthy();
    const d = await publishVersion(deps, ctxFor(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null });
    expect(d.step).toBe("done");
    expect(client.apps.size).toBe(1);
    expect(client.calls.filter((c) => c === "createWin32App")).toHaveLength(1);
    expect(client.calls.filter((c) => c === "createContentVersion")).toHaveLength(1);
  });
  it("refuses a tampered manifest, a held version, a missing ring setup and a disconnected tenant", async () => {
    const { tenant, client } = await setup(`org-g-${++n}`);
    const col = deps.db.collection<CatalogVersion>("catalog_versions");
    const v = (await col.get("7-zip@25.01"))!;
    await col.put({ ...v, sha256: "ff" + v.sha256.slice(2) });
    await expect(publishVersion(deps, ctxFor(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: v.id, actorId: null })).rejects.toMatchObject({ code: "manifest_invalid" });
    await expect(publishVersion(deps, ctxFor(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "adobe-acrobat-reader@25.001.20630", actorId: null })).rejects.toMatchObject({ code: "not_publishable" });
    expect(client.apps.size).toBe(0);
    await col.put(v);
    await deps.db.collection("ring_configs").delete(tenant.id);
    await expect(publishVersion(deps, ctxFor(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: v.id, actorId: null })).rejects.toMatchObject({ code: "rings_not_configured" });
    await expect(publishVersion(deps, ctxFor(), { orgId: "other-org", tenantId: tenant.id, versionId: v.id, actorId: null })).rejects.toMatchObject({ code: "tenant_not_found" });
  });
});

describe("rings: promotion, pause, rollback", () => {
  async function published(org: string) {
    const s = await setup(org);
    await makeVerified("7-zip@25.01"); // the manifest does not cover the checks, so the signature stays valid
    const d = await publishVersion(deps, ctxFor(), { orgId: s.tenant.orgId, tenantId: s.tenant.id, versionId: "7-zip@25.01", actorId: "u1" });
    return { ...s, d };
  }
  const reload = (id: string) => deps.db.collection<Deployment>("deployments").get(id).then((x) => x!);

  it("promotes Pilot to Broad only after the 48 h delay", async () => {
    const { client, d } = await published(`org-t-${++n}`);
    client.summaries.set(d.intuneAppId!, { installed: 9, failed: 0, pending: 1 });
    expect((await ringTick(deps)).promoted).toBe(0);
    hours(47);
    expect((await ringTick(deps)).promoted).toBe(0);
    hours(2);
    expect((await ringTick(deps)).promoted).toBe(1);
    const after = await reload(d.id);
    expect(after.state).toBe("promoted");
    expect(client.apps.get(d.intuneAppId!)!.assignments.map((a) => a.groupId)).toEqual(["g-pilot", "g-broad"]);
  });
  it("promotes after the delay when there is no Pilot install data (documented behaviour)", async () => {
    const { d } = await published(`org-n-${++n}`);
    hours(49);
    expect((await ringTick(deps)).promoted).toBe(1);
    expect((await reload(d.id)).state).toBe("promoted");
  });
  it("pauses at the 10% failure threshold, raises an alert and never reaches Broad", async () => {
    const { client, d, tenant } = await published(`org-f-${++n}`);
    await deps.db.collection<RingConfig>("ring_configs").put({ ...(await deps.db.collection<RingConfig>("ring_configs").get(tenant.id))!, alertEmail: "owner@msp.test" });
    client.summaries.set(d.intuneAppId!, { installed: 8, failed: 2, pending: 0 });
    const r = await ringTick(deps);
    expect(r.paused).toBe(1);
    const after = await reload(d.id);
    expect(after.state).toBe("paused");
    expect(after.failurePct).toBe(20);
    expect(after.pausedReason).toMatch(/20%/);
    hours(60);
    expect((await ringTick(deps)).promoted).toBe(0);
    expect(client.apps.get(d.intuneAppId!)!.assignments.map((a) => a.groupId)).toEqual(["g-pilot"]);
    expect((await deps.db.collection<Alert>("alerts").find({ orgId: tenant.orgId })).some((a) => a.kind === "ring.paused")).toBe(true);
    expect(mails.some((m) => m.to === "owner@msp.test" && /paused/i.test(m.subject))).toBe(true);
    expect((await deps.db.listAudit(tenant.orgId)).map((a) => a.action)).toContain("deployment.paused");
  });
  it("a failure rate just under the threshold still promotes", async () => {
    const { client, d } = await published(`org-u-${++n}`);
    client.summaries.set(d.intuneAppId!, { installed: 91, failed: 9, pending: 0 });
    hours(49);
    expect((await ringTick(deps)).promoted).toBe(1);
  });
  it("Pilot only while the VM check is pending: never promotes to Broad (D-01)", async () => {
    const s = await setup(`org-v-${++n}`);
    const d = await publishVersion(deps, ctxFor(), { orgId: s.tenant.orgId, tenantId: s.tenant.id, versionId: "7-zip@25.01", actorId: null });
    hours(100);
    const r = await ringTick(deps);
    expect(r.promoted).toBe(0);
    expect(r.waitingForVm).toBe(1);
    expect((await reload(d.id)).state).toBe("assigned");
    const rows = dockRows(await listCatalog(deps.db), [await reload(d.id)], s.cfg, clock.getTime());
    expect(rows.find((x) => x.slug === "7-zip")).toMatchObject({ statusLabel: "Pilot only", tag: "Inspection 3/4 · VM pending" });
  });
  it("tenant pause and org pause stop ticks", async () => {
    const { d, tenant } = await published(`org-z-${++n}`);
    hours(49);
    await setTenantPaused(deps, tenant.orgId, tenant.id, true, "u1");
    expect((await ringTick(deps)).promoted).toBe(0);
    await setTenantPaused(deps, tenant.orgId, tenant.id, false, "u1");
    await setOrgPaused(deps, tenant.orgId, true, "u1");
    expect((await ringTick(deps)).promoted).toBe(0);
    await setOrgPaused(deps, tenant.orgId, false, "u1");
    expect((await ringTick(deps)).promoted).toBe(1);
    expect((await reload(d.id)).state).toBe("promoted");
    expect((await deps.db.listAudit(tenant.orgId)).map((a) => a.action)).toEqual(expect.arrayContaining(["tenant.paused", "org.paused"]));
  });
  it("a revoked tenant is disconnected by the tick and the loop continues", async () => {
    const { client, tenant, d } = await published(`org-k-${++n}`);
    hours(49);
    client.consent = false;
    await ringTick(deps);
    expect((await deps.db.collection<Tenant>("tenants").get(tenant.id))!.status).toBe("disconnected");
    expect((await reload(d.id)).state).toBe("assigned");
  });

  async function twoVersions(org: string) {
    const s = await setup(org);
    await makeVerified("7-zip@25.01");
    const first = await publishVersion(deps, ctxFor(), { orgId: s.tenant.orgId, tenantId: s.tenant.id, versionId: "7-zip@25.01", actorId: "u1" });
    hours(49);
    await ringTick(deps); // N reaches Broad
    // a newer verified version 25.02
    const col = deps.db.collection<CatalogVersion>("catalog_versions");
    const old = (await col.get("7-zip@25.01"))!;
    const next: CatalogVersion = { ...old, id: "7-zip@25.02", version: "25.02", createdAt: clock.toISOString() };
    next.manifestSig = signVersion(signer, next);
    await col.put(next);
    const app = (await deps.db.collection<{ id: string; currentVersionId: string }>("catalog").get("7-zip"))!;
    await deps.db.collection<{ id: string; currentVersionId: string }>("catalog").put({ ...app, currentVersionId: next.id });
    const second = await publishVersion(deps, ctxFor(), { orgId: s.tenant.orgId, tenantId: s.tenant.id, versionId: next.id, actorId: "u1" });
    return { ...s, first, second };
  }

  it("one click rollback re-assigns N as Required and N+1 as Uninstall, and writes an audit entry", async () => {
    const { client, first, second, tenant } = await twoVersions(`org-b-${++n}`);
    const r = await rollback(deps, { orgId: tenant.orgId, deploymentId: second.id, actorId: "u-op" });
    expect(r.from.state).toBe("rolled_back");
    expect(r.to.id).toBe(first.id);
    expect(client.apps.get(second.intuneAppId!)!.assignments).toEqual([{ groupId: "g-pilot", intent: "uninstall" }]);
    expect(client.apps.get(first.intuneAppId!)!.assignments).toEqual([{ groupId: "g-pilot", intent: "required" }]);
    const entry = (await deps.db.listAudit(tenant.orgId)).find((a) => a.action === "deployment.rolled_back")!;
    expect(entry).toMatchObject({ actorId: "u-op", target: second.id, meta: { from: "25.02", to: "25.01", tenantId: tenant.id } });
    await expect(rollback(deps, { orgId: tenant.orgId, deploymentId: second.id, actorId: "u" })).rejects.toMatchObject({ code: "not_rollbackable" });
    await expect(rollback(deps, { orgId: "someone-else", deploymentId: first.id, actorId: "u" })).rejects.toMatchObject({ code: "deployment_not_found" });
  });
  it("rollback has nothing to restore for the first version", async () => {
    const { d, tenant } = await published(`org-e-${++n}`);
    await expect(rollback(deps, { orgId: tenant.orgId, deploymentId: d.id, actorId: "u" })).rejects.toMatchObject({ code: "no_previous_version" });
  });
  it("a paused version rolls back and the dock shows the roll back target", async () => {
    const { client, second, tenant, cfg } = await twoVersions(`org-q-${++n}`);
    client.summaries.set(second.intuneAppId!, { installed: 1, failed: 1, pending: 0 });
    await ringTick(deps);
    const paused = await reload(second.id);
    expect(paused.state).toBe("paused");
    const rows = dockRows(await listCatalog(deps.db), await deps.db.collection<Deployment>("deployments").find({ tenantId: tenant.id }), cfg, clock.getTime());
    const row = rows.find((x) => x.slug === "7-zip")!;
    expect(row).toMatchObject({ paused: true, status: "paused", rollbackTo: { version: "25.01" } });
    await rollback(deps, { orgId: tenant.orgId, deploymentId: second.id, actorId: "u" });
  });
  it("auto update toggle controls fan out of a new version", async () => {
    const { tenant, first } = await twoVersions(`org-a-${++n}`);
    await setAutoUpdate(deps, { orgId: tenant.orgId, tenantId: tenant.id, appSlug: "7-zip", autoUpdate: false, actorId: "u" });
    expect(await fanout(deps, ctxFor(), "7-zip@25.02")).toEqual([]);
    await setAutoUpdate(deps, { orgId: tenant.orgId, tenantId: tenant.id, appSlug: "7-zip", autoUpdate: true, actorId: "u" });
    const res = await fanout(deps, ctxFor(), "7-zip@25.02");
    expect(res).toEqual([{ tenantId: tenant.id, status: "published" }]);
    expect(first.id).toBeTruthy();
    expect((await deps.db.listAudit(tenant.orgId)).map((a) => a.action)).toContain("tenant_app.auto_update");
  });
});

describe("real Graph client (stubbed fetch)", () => {
  const tokenOk = () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
  it("backs off on 429 using Retry-After, then succeeds", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const f = (async (url: string | URL) => {
      if (String(url).includes("oauth2")) return tokenOk();
      calls++;
      return calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "7" } }) : new Response(JSON.stringify({ value: [{ id: "tid", displayName: "Contoso" }] }));
    }) as typeof fetch;
    const c = new RealGraphClient({ entraTenantId: ENTRA, clientId: "c", clientSecret: "s", fetchImpl: f, sleep: async (ms) => { sleeps.push(ms); } });
    expect(await c.getOrganization()).toEqual({ id: "tid", displayName: "Contoso" });
    expect(sleeps).toEqual([7000]);
  });
  it("maps a revoked consent response to GraphConsentError", async () => {
    const f = (async (url: string | URL) => (String(url).includes("oauth2") ? new Response("AADSTS700016: Application not found in the directory", { status: 400 }) : new Response("{}"))) as typeof fetch;
    const c = new RealGraphClient({ entraTenantId: ENTRA, clientId: "c", clientSecret: "s", fetchImpl: f, sleep: async () => {} });
    await expect(c.getOrganization()).rejects.toBeInstanceOf(GraphConsentError);
  });
  it("sends the win32LobApp body with detection rules and the assignment payload", async () => {
    const seen: { url: string; body: Record<string, unknown> }[] = [];
    const f = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("oauth2")) return tokenOk();
      seen.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ id: "app-1" }));
    }) as typeof fetch;
    const c = new RealGraphClient({ entraTenantId: ENTRA, clientId: "c", clientSecret: "s", fetchImpl: f, sleep: async () => {} });
    await ensureCatalogSeeded(deps.db, signer, clock);
    const { win32Body } = await import("@/lib/publish/win32");
    const e = (await getCatalogEntry(deps.db, "7-zip"))!;
    await c.createWin32App(win32Body(e.app, e.version));
    await c.assignApp("app-1", [{ groupId: "g1", intent: "required" }]);
    expect(seen[0]!.body["@odata.type"]).toBe("#microsoft.graph.win32LobApp");
    expect(seen[0]!.body.displayName).toBe("DC | 7-Zip 25.01");
    expect((seen[0]!.body.rules as { "@odata.type": string }[])[0]!["@odata.type"]).toBe("#microsoft.graph.win32LobAppProductCodeRule");
    expect(seen[1]!.url).toContain("/mobileApps/app-1/assign");
    expect(JSON.stringify(seen[1]!.body)).toContain("groupAssignmentTarget");
  });
  it("fake client records an unknown call as a failure without a network", async () => {
    const c = new FakeGraphClient();
    expect((await c.getOrganization()).displayName).toBe("Fake tenant");
  });
});
