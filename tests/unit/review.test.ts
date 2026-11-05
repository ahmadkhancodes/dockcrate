// M5 pre-launch review: regression tests for every P0 in docs/REVIEW.md. Each failed before its fix.
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { createMemoryDb } from "@/lib/db/memory";
import type { Deps } from "@/lib/deps";
import { FakeGraphFactory } from "@/lib/graph/fake";
import { ACCOUNT_LINKING } from "@/lib/auth";
import { buildConsentUrl, createTenant, handleConsentCallback, type Alert, type Tenant } from "@/lib/tenants";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { generateTestSigner, signVersion } from "@/lib/catalog/manifest";
import { verifyVersion } from "@/lib/catalog/verify";
import { PendingVmLab } from "@/lib/catalog/vmlab";
import type { CatalogVersion } from "@/lib/catalog/types";
import { BufferInstallerSource } from "@/lib/publish/installer";
import { publishVersion, PUBLISH_LEASE_MS, type PublishCtx } from "@/lib/publish/win32";
import { defaultRingConfig, fanout, ringTick, rollback, setOrgPaused } from "@/lib/rings/engine";
import type { Deployment, RingConfig } from "@/lib/rings/types";

let deps: Deps;
let graph: FakeGraphFactory;
let n = 0;
const signer = generateTestSigner();
let clock = new Date("2026-11-05T10:00:00Z");
const hours = (h: number) => { clock = new Date(clock.getTime() + h * 3_600_000); };
const ctx = (): PublishCtx => ({ installer: new BufferInstallerSource(Buffer.from("MZ")), signer, maxPolls: 5, sleep: async () => {} });
const entraId = () => `aaaaaaaa-bbbb-cccc-dddd-${String(++n).padStart(12, "0")}`;
const stateFor = (orgId: string, tenantId: string) => new URL(buildConsentUrl({ baseUrl: deps.baseUrl, orgId, tenantId, clientId: "c", now: clock.getTime() })).searchParams.get("state");
const deployments = () => deps.db.collection<Deployment>("deployments");
const versions = () => deps.db.collection<CatalogVersion>("catalog_versions");

beforeEach(async () => {
  clock = new Date("2026-11-05T10:00:00Z");
  globalThis.__kitMemoryDb = createMemoryDb("dockcrate");
  graph = new FakeGraphFactory();
  deps = { db: await getDb(), graph, sendMail: async () => {}, baseUrl: "https://dockcrate.test", now: () => clock };
});

async function connect(orgId: string, entra = entraId()) {
  const t = await createTenant(deps, { orgId, name: `T ${orgId}`, actorId: null });
  const r = await handleConsentCallback(deps, { state: stateFor(orgId, t.id), tenant: entra, admin_consent: "True" });
  return { t: (await deps.db.collection<Tenant>("tenants").get(t.id))!, r, entra };
}

async function setup(orgId: string) {
  await ensureCatalogSeeded(deps.db, signer, clock);
  const { t } = await connect(orgId);
  await deps.db.collection<RingConfig>("ring_configs").put(defaultRingConfig(t, { id: "g-pilot", name: "Pilot" }, { id: "g-broad", name: "Broad" }));
  return { tenant: t, client: graph.forTenant(t.entraTenantId!) };
}

async function setChecks(id: string, vm: "pass" | "pending") {
  const v = (await versions().get(id))!;
  await versions().put({ ...v, status: vm === "pass" ? "verified" : "verified_static", verification: { ...v.verification, checks: { ...v.verification.checks, vm } } });
}

async function newVersion(from: string, version: string, vm: "pass" | "pending") {
  const old = (await versions().get(from))!;
  const next: CatalogVersion = { ...old, id: `7-zip@${version}`, version, createdAt: clock.toISOString(), verification: { ...old.verification, checks: { ...old.verification.checks, vm } }, status: vm === "pass" ? "verified" : "verified_static" };
  next.manifestSig = signVersion(signer, next);
  await versions().put(next);
  return next.id;
}

describe("P0-1 sign in: no implicit account linking on Entra's unverified email claim (nOAuth)", () => {
  it("linking is off and Microsoft is not a trusted provider", () => {
    expect(ACCOUNT_LINKING.enabled).toBe(false);
    expect(ACCOUNT_LINKING.trustedProviders).not.toContain("microsoft");
  });
});

describe("P0-2 consent callback: a forged redirect cannot claim or rebind a Microsoft tenant", () => {
  it("refuses a tenant already connected to another organization and alerts its owner", async () => {
    const victim = await connect("org-victim");
    expect(victim.t.status).toBe("connected");
    const attacker = await createTenant(deps, { orgId: "org-attacker", name: "Mine", actorId: null });
    const r = await handleConsentCallback(deps, { state: stateFor("org-attacker", attacker.id), tenant: victim.entra, admin_consent: "True" });
    expect(r.ok).toBe(false);
    const row = (await deps.db.collection<Tenant>("tenants").get(attacker.id))!;
    expect(row.entraTenantId).toBeNull();
    expect(row.status).not.toBe("connected");
    expect((await deps.db.collection<Alert>("alerts").find({ orgId: "org-victim" })).some((a) => a.kind === "tenant.claim_attempt")).toBe(true);
  });
  it("never moves a connected row to a different Microsoft tenant", async () => {
    const { t, entra } = await connect("org-rebind");
    const r = await handleConsentCallback(deps, { state: stateFor("org-rebind", t.id), tenant: entraId(), admin_consent: "True" });
    expect(r.ok).toBe(false);
    expect((await deps.db.collection<Tenant>("tenants").get(t.id))!.entraTenantId).toBe(entra);
  });
});

describe("P0-3 rollback never re-assigns a version beyond what its checks allow", () => {
  it("refuses to restore a Pilot only (VM pending) version onto Broad", async () => {
    const { tenant } = await setup("org-rb1");
    const first = await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null }); // 3/4, Pilot only
    hours(1);
    const nextId = await newVersion("7-zip@25.01", "25.02", "pass");
    const second = await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: nextId, actorId: null });
    hours(49);
    expect((await ringTick(deps)).promoted).toBe(1);
    await expect(rollback(deps, { orgId: tenant.orgId, deploymentId: second.id, actorId: "u" })).rejects.toMatchObject({ code: "rollback_target_blocked" });
    expect(graph.forTenant(tenant.entraTenantId!).apps.get(first.intuneAppId!)!.assignments.some((a) => a.groupId === "g-broad")).toBe(false);
  });
  it("refuses to restore a version that has since been held", async () => {
    const { tenant } = await setup("org-rb2");
    await setChecks("7-zip@25.01", "pass");
    await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null });
    hours(1);
    const nextId = await newVersion("7-zip@25.01", "25.02", "pass");
    const second = await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: nextId, actorId: null });
    const old = (await versions().get("7-zip@25.01"))!;
    await versions().put({ ...old, status: "held", verification: { ...old.verification, checks: { ...old.verification.checks, scan: "fail" }, heldReason: "Detection found later." } });
    await expect(rollback(deps, { orgId: tenant.orgId, deploymentId: second.id, actorId: "u" })).rejects.toMatchObject({ code: "rollback_target_blocked" });
  });
});

describe("P0-4 a new version retires the old one per ring", () => {
  it("removes N from Pilot when N+1 lands there, and from Broad when N+1 is promoted", async () => {
    const { tenant, client } = await setup("org-sup1");
    await setChecks("7-zip@25.01", "pass");
    const first = await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null });
    hours(49);
    await ringTick(deps);
    const nextId = await newVersion("7-zip@25.01", "25.02", "pass");
    await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: nextId, actorId: null });
    expect(client.apps.get(first.intuneAppId!)!.assignments).toEqual([{ groupId: "g-broad", intent: "required" }]);
    hours(49);
    await ringTick(deps);
    expect(client.apps.get(first.intuneAppId!)!.assignments).toEqual([]);
    expect((await deployments().get(first.id))!.state).toBe("superseded");
  });
  it("an old Pilot deployment is not promoted to Broad after a newer version replaced it", async () => {
    const { tenant, client } = await setup("org-sup2");
    await setChecks("7-zip@25.01", "pass");
    const first = await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null });
    hours(10);
    const nextId = await newVersion("7-zip@25.01", "25.02", "pass");
    await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: nextId, actorId: null });
    hours(40); // past N's 48 h, before N+1's
    expect((await ringTick(deps)).promoted).toBe(0);
    expect(client.apps.get(first.intuneAppId!)!.assignments.some((a) => a.groupId === "g-broad")).toBe(false);
  });
});

describe("P0-5 one publish at a time per tenant and version", () => {
  it("a second call while the first holds the lease does not create a second Intune app", async () => {
    const { tenant, client } = await setup("org-lease");
    await expect(Promise.all([
      publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null }),
      publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null }),
    ])).rejects.toMatchObject({ code: "publish_in_progress" });
    expect(client.apps.size).toBeLessThanOrEqual(1);
    expect((await deployments().find({ tenantId: tenant.id })).length).toBeLessThanOrEqual(1);
    // Whoever backed off retries and ends with exactly one Intune app.
    hours(1);
    await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null });
    expect(client.apps.size).toBe(1);
  });
  it("an interrupted upload with a live lease is refused, and resumes once the lease expires", async () => {
    const { tenant, client } = await setup("org-lease2");
    client.failNext.set("uploadToStorage", 1);
    await expect(publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null })).rejects.toBeTruthy();
    const d = (await deployments().find({ tenantId: tenant.id }))[0]!;
    await deployments().put({ ...d, leaseUntil: `${new Date(clock.getTime() + PUBLISH_LEASE_MS).toISOString()}|other` });
    await expect(publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null })).rejects.toMatchObject({ code: "publish_in_progress" });
    hours(1);
    expect((await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null })).step).toBe("done");
    expect(client.apps.size).toBe(1);
  });
});

describe("P1 fixes", () => {
  it("a scoped technician only reads audit entries of tenants in scope", async () => {
    const { auditVisible } = await import("@/lib/authz");
    const tech = { role: "operator", tenantScope: ["t1"] };
    expect(auditVisible(tech, { meta: { tenantId: "t1" } })).toBe(true);
    expect(auditVisible(tech, { meta: { tenantId: "t2" } })).toBe(false);
    expect(auditVisible(tech, { meta: null })).toBe(true);
    expect(auditVisible({ role: "admin", tenantScope: ["t1"] }, { meta: { tenantId: "t2" } })).toBe(true);
  });
  it("an unsigned installer fails the signer check", async () => {
    await ensureCatalogSeeded(deps.db, signer, clock);
    const v = (await versions().get("7-zip@25.01"))!;
    const out = await verifyVersion({ ...v, previousSignerThumbprint: null }, { observedSha256: v.sha256, signerThumbprint: "", scan: { clean: true, signatureAgeHours: 1 } }, new PendingVmLab(), clock, false);
    expect(out.verification.checks.signer).toBe("fail");
    expect(out.status).toBe("held");
  });
  it("org wide pause also stops a manual publish", async () => {
    const { tenant } = await setup("org-op");
    await setOrgPaused(deps, tenant.orgId, true, "u");
    await expect(publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null })).rejects.toMatchObject({ code: "org_paused" });
  });
  it("auto update fan out respects the device grace", async () => {
    const { tenant } = await setup("org-grace");
    await publishVersion(deps, ctx(), { orgId: tenant.orgId, tenantId: tenant.id, versionId: "7-zip@25.01", actorId: null });
    await deps.db.collection<{ id: string; overSince: string }>("org_billing").put({ id: tenant.orgId, overSince: new Date(clock.getTime() - 30 * 86_400_000).toISOString() });
    await deps.db.collection<{ id: string; tenantId: string; orgId: string; count: number }>("device_counts").put({ id: tenant.id, tenantId: tenant.id, orgId: tenant.orgId, count: 100_000 });
    const nextId = await newVersion("7-zip@25.01", "25.02", "pending");
    const res = await fanout(deps, ctx(), nextId);
    expect(res).toEqual([{ tenantId: tenant.id, status: "error", detail: "device_grace_ended" }]);
  });
});
