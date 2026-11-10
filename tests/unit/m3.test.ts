import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { createMemoryDb } from "@/lib/db/memory";
import type { AuditEntry } from "@/lib/db/types";
import type { Deps } from "@/lib/deps";
import { FakeGraphFactory } from "@/lib/graph/fake";
import { HttpError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { AUDIT_CSV_HEADER, auditCsv, collectAudit, csvCell, filterAudit, parseAuditFilter } from "@/lib/audit-export";
import { lifetimeEntitlement } from "@/lib/billing/entitlement";
import { FakeDeviceCounter, InstallDataDeviceCounter, type DeviceCount } from "@/lib/billing/devices";
import { assertCanAddTenant, assertCanPublish, deviceCountJob, orgLimits, limitStates } from "@/lib/billing/limits";
import { usageState } from "@/lib/billing/usage";
import { APP_SET_CONCURRENCY, createRun, executeRun, pool, queueRetry, retryFailed, runCounts, saveAppSet, type AppSet } from "@/lib/appsets";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { generateTestSigner } from "@/lib/catalog/manifest";
import { FakeInstallerDownloader, FakeScanner, FakeWingetSource, NoInstallerUrlError, collectEvidence } from "@/lib/catalog/pipeline";
import { catalogSync, fakePipeline } from "@/lib/catalog/sync";
import type { CatalogApp, CatalogVersion } from "@/lib/catalog/types";
import { verifyVersion } from "@/lib/catalog/verify";
import { PendingVmLab } from "@/lib/catalog/vmlab";
import { DAILY_SEQUENCE, cronJobs } from "@/lib/cron/jobs";
import { mspOverview, parseMspFilter } from "@/lib/msp/overview";
import { BufferInstallerSource } from "@/lib/publish/installer";
import type { PublishCtx } from "@/lib/publish/win32";
import { validateRingConfig } from "@/lib/rings/config";
import { defaultRingConfig } from "@/lib/rings/engine";
import type { Deployment, RingConfig, TenantApp } from "@/lib/rings/types";
import { buildConsentUrl, createTenant, handleConsentCallback, type Tenant } from "@/lib/tenants";
import vercel from "../../vercel.json";

const signer = generateTestSigner();
const clock = new Date("2026-11-05T10:00:00Z");
let now = clock;
let deps: Deps;
let graph: FakeGraphFactory;
let seq = 0;
const ctx = (): PublishCtx => ({ installer: new BufferInstallerSource(Buffer.from("MZ-installer")), signer, maxPolls: 5, sleep: async () => {} });
const days = (d: number) => new Date(clock.getTime() + d * 86_400_000);

async function tenant(orgId: string, opts: { rings?: boolean; name?: string } = {}): Promise<Tenant> {
  const entra = `11111111-2222-3333-4444-5555${String(++seq).padStart(8, "0")}`;
  const t = await createTenant(deps, { orgId, name: opts.name ?? `Client ${seq}`, actorId: "u1" });
  const state = new URL(buildConsentUrl({ baseUrl: deps.baseUrl, orgId, tenantId: t.id, clientId: "c", now: now.getTime() })).searchParams.get("state");
  const r = await handleConsentCallback(deps, { state, tenant: entra, admin_consent: "True" });
  expect(r.status).toBe("connected");
  const full = (await deps.db.collection<Tenant>("tenants").get(t.id))!;
  if (opts.rings !== false) await deps.db.collection<RingConfig>("ring_configs").put(defaultRingConfig(full, { id: "g-pilot", name: "DC-Pilot" }, { id: "g-broad", name: "DC-Broad" }));
  return full;
}

beforeEach(async () => {
  now = clock;
  globalThis.__kitMemoryDb = createMemoryDb("dockcrate");
  graph = new FakeGraphFactory();
  deps = { db: await getDb(), graph, sendMail: async () => {}, baseUrl: "https://dockcrate.test", now: () => now };
  await ensureCatalogSeeded(deps.db, signer, clock);
});

describe("ring config validation", () => {
  const t = { id: "t1", orgId: "o1" };
  const groups = [{ id: "g1", displayName: "DC-Pilot" }, { id: "g2", displayName: "DC-Broad" }, { id: "g3", displayName: "Everyone" }];
  it("applies the brief's defaults and takes group names from Graph, not the client", () => {
    const c = validateRingConfig(t, { tenantId: "t1", pilot: { id: "g1", name: "evil" }, broad: { id: "g2" } }, groups);
    expect(c).toMatchObject({ id: "t1", orgId: "o1", failThresholdPct: 10, intent: "required", autoUpdateDefault: true, alertEmail: null });
    expect(c.pilot).toEqual({ groupId: "g1", groupName: "DC-Pilot", delayHours: 0 });
    expect(c.broad).toEqual({ groupId: "g2", groupName: "DC-Broad", delayHours: 48 });
  });
  it("accepts custom delays, threshold, intent, auto update default and alert email", () => {
    const c = validateRingConfig(t, { tenantId: "t1", pilot: { id: "g1" }, broad: { id: "g3" }, pilotDelayHours: 2, broadDelayHours: 72, failThresholdPct: 25, intent: "available", autoUpdateDefault: false, alertEmail: "noc@msp.test" }, groups);
    expect(c).toMatchObject({ failThresholdPct: 25, intent: "available", autoUpdateDefault: false, alertEmail: "noc@msp.test" });
    expect([c.pilot.delayHours, c.broad.delayHours]).toEqual([2, 72]);
  });
  const bad = (over: Record<string, unknown>) => () => validateRingConfig(t, { tenantId: "t1", pilot: { id: "g1" }, broad: { id: "g2" }, ...over } as never, groups);
  it("rejects bad input with a plain sentence", () => {
    expect(bad({ broad: { id: "g1" } })).toThrow(HttpError);
    expect(bad({ pilot: { id: "nope" } })).toThrow(HttpError);
    try { bad({ pilot: { id: "nope" } })(); } catch (e) { expect((e as HttpError).details).toMatch(/Pilot group/); }
    expect(bad({ broad: { id: "nope" } })).toThrow(HttpError);
    expect(bad({ broadDelayHours: -1 })).toThrow(HttpError);
    expect(bad({ broadDelayHours: 1.5 })).toThrow(HttpError);
    expect(bad({ broadDelayHours: 24 * 30 + 1 })).toThrow(HttpError);
    expect(bad({ pilotDelayHours: 10, broadDelayHours: 5 })).toThrow(HttpError);
    expect(bad({ failThresholdPct: 0 })).toThrow(HttpError);
    expect(bad({ failThresholdPct: 101 })).toThrow(HttpError);
    expect(bad({ alertEmail: "not-an-email" })).toThrow(HttpError);
    try { bad({ failThresholdPct: 0 })(); } catch (e) { expect((e as HttpError).code).toBe("invalid_rings"); expect(typeof (e as HttpError).details).toBe("string"); }
  });
});

describe("App Sets", () => {
  async function setup(count: number) {
    const org = `org-as-${++seq}`;
    const tenants: Tenant[] = [];
    for (let i = 0; i < count; i++) tenants.push(await tenant(org));
    const set = await saveAppSet(deps, { orgId: org, name: "Baseline", appSlugs: ["7-zip", "google-chrome"], actorId: "u1" });
    return { org, tenants, set };
  }
  it("validates names and apps, scopes by org and audits", async () => {
    const org = "org-v";
    await expect(saveAppSet(deps, { orgId: org, name: "x", appSlugs: ["7-zip"], actorId: null })).rejects.toThrow(HttpError);
    await expect(saveAppSet(deps, { orgId: org, name: "Okay", appSlugs: [], actorId: null })).rejects.toThrow(HttpError);
    await expect(saveAppSet(deps, { orgId: org, name: "Okay", appSlugs: ["nope"], actorId: null })).rejects.toMatchObject({ code: "invalid_apps", details: "Unknown app: nope." });
    const s = await saveAppSet(deps, { orgId: org, name: "Okay", appSlugs: ["7-zip", "7-zip"], actorId: "u1" });
    expect(s).toMatchObject({ appSlugs: ["7-zip"], intent: "required", autoUpdate: true });
    await expect(saveAppSet(deps, { orgId: "other", id: s.id, name: "Hijack", appSlugs: ["7-zip"], actorId: null })).rejects.toThrow(HttpError);
    expect((await deps.db.listAudit(org)).map((a) => a.action)).toContain("app_set.created");
  });
  it("pool never exceeds the concurrency limit and visits every item", async () => {
    let inflight = 0, peak = 0;
    const seen: number[] = [];
    await pool([1, 2, 3, 4, 5, 6, 7, 8], APP_SET_CONCURRENCY, async (n) => { inflight++; peak = Math.max(peak, inflight); await new Promise((r) => setTimeout(r, 2)); seen.push(n); inflight--; });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("fans out to every tenant, 3 at a time, with per tenant results", async () => {
    const { org, tenants, set } = await setup(7);
    let inflight = 0, peak = 0;
    for (const t of tenants) {
      const c = graph.forTenant(t.entraTenantId!);
      const orig = c.createWin32App.bind(c);
      c.createWin32App = async (b) => { inflight++; peak = Math.max(peak, inflight); await new Promise((r) => setTimeout(r, 3)); try { return await orig(b); } finally { inflight--; } };
    }
    const run = await createRun(deps, { orgId: org, appSetId: set.id, tenantIds: tenants.map((t) => t.id), actorId: "u1" });
    expect(run.results.every((r) => r.status === "queued")).toBe(true);
    const done = await executeRun(deps, ctx(), run.id);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
    expect(done.status).toBe("completed");
    expect(runCounts(done)).toEqual({ total: 7, succeeded: 7, failed: 0, pending: 0 });
    expect(done.results[0]!.apps).toEqual([{ slug: "7-zip", status: "published" }, { slug: "google-chrome", status: "published" }]);
    const deployments = await deps.db.collection<Deployment>("deployments").find({ orgId: org });
    expect(deployments).toHaveLength(14);
    expect((await deps.db.listAudit(org)).map((a) => a.action)).toEqual(expect.arrayContaining(["app_set.run_started", "app_set.run_finished"]));
  });
  it("one revoked tenant fails alone and a retry runs only the failed tenant", async () => {
    const { org, tenants, set } = await setup(4);
    const revoked = tenants[2]!;
    graph.forTenant(revoked.entraTenantId!).consent = false;
    const run = await createRun(deps, { orgId: org, appSetId: set.id, tenantIds: tenants.map((t) => t.id), actorId: "u1" });
    const first = await executeRun(deps, ctx(), run.id);
    expect(runCounts(first)).toMatchObject({ succeeded: 3, failed: 1 });
    const bad = first.results.find((r) => r.tenantId === revoked.id)!;
    expect(bad).toMatchObject({ status: "failed", attempts: 1 });
    expect(bad.error).toBeTruthy();

    const callsBefore = graph.forTenant(tenants[0]!.entraTenantId!).calls.length;
    graph.forTenant(revoked.entraTenantId!).consent = true;
    const queued = await queueRetry(deps, { orgId: org, runId: run.id, actorId: "u1" });
    expect(queued.run.status).toBe("running");
    expect(queued.run.results.find((r) => r.tenantId === revoked.id)!.status).toBe("queued");
    expect(queued.failed).toEqual([revoked.id]);
    const second = await executeRun(deps, ctx(), run.id, { only: queued.failed });
    expect(runCounts(second)).toMatchObject({ succeeded: 4, failed: 0 });
    expect(second.results.find((r) => r.tenantId === revoked.id)!.attempts).toBe(2);
    expect(second.results.find((r) => r.tenantId === tenants[0]!.id)!.attempts).toBe(1);
    expect(graph.forTenant(tenants[0]!.entraTenantId!).calls.length).toBe(callsBefore);
    await expect(retryFailed(deps, ctx(), { orgId: org, runId: run.id, actorId: "u1" })).rejects.toMatchObject({ code: "nothing_to_retry" });
  });
  it("a disconnected or unconfigured tenant fails with its reason; the guard blocks publishing", async () => {
    const { org, tenants, set } = await setup(2);
    const noRings = await tenant(org, { rings: false });
    await deps.db.collection<Tenant>("tenants").put({ ...tenants[1]!, status: "disconnected" });
    const run = await createRun(deps, { orgId: org, appSetId: set.id, tenantIds: [tenants[0]!.id, tenants[1]!.id, noRings.id], actorId: null });
    const done = await executeRun(deps, ctx(), run.id);
    expect(done.results.map((r) => r.status)).toEqual(["succeeded", "failed", "failed"]);
    expect(done.results[1]!.apps.map((a) => a.detail)).toEqual(["tenant_not_connected", "tenant_not_connected"]);
    expect(done.results[2]!.error).toMatch(/rings_not_configured|Pick the Pilot/);
    const run2 = await createRun(deps, { orgId: org, appSetId: set.id, tenantIds: [tenants[0]!.id], actorId: null });
    const guarded = await executeRun(deps, ctx(), run2.id, { guard: async () => { throw new HttpError(402, "device_grace_ended", "Over the limit."); } });
    expect(guarded.results[0]).toMatchObject({ status: "failed" });
    expect(guarded.results[0]!.apps.every((a) => a.status === "error")).toBe(true);
  });
  it("applies the set's ring defaults (auto update off)", async () => {
    const { org, tenants } = await setup(1);
    const set = await saveAppSet(deps, { orgId: org, name: "Manual", appSlugs: ["7-zip"], autoUpdate: false, intent: "available", actorId: null });
    const run = await createRun(deps, { orgId: org, appSetId: set.id, tenantIds: [tenants[0]!.id], actorId: null });
    await executeRun(deps, ctx(), run.id);
    expect((await deps.db.collection<TenantApp>("tenant_apps").get(`${tenants[0]!.id}:7-zip`))!.autoUpdate).toBe(false);
    expect(graph.forTenant(tenants[0]!.entraTenantId!).apps.values().next().value!.assignments[0]!.intent).toBe("available");
  });
  it("refuses another org's tenants and empty selections", async () => {
    const { org, set } = await setup(1);
    const other = await tenant("org-other");
    await expect(createRun(deps, { orgId: org, appSetId: set.id, tenantIds: [other.id], actorId: null })).rejects.toMatchObject({ status: 404 });
    await expect(createRun(deps, { orgId: org, appSetId: set.id, tenantIds: [], actorId: null })).rejects.toMatchObject({ code: "invalid_tenants" });
    expect(await deps.db.collection<AppSet>("app_sets").get(set.id)).toBeTruthy();
  });
});

describe("device counting and plan limits", () => {
  it("usage levels: ok under 80%, near from 80%, over at 100%", () => {
    expect(usageState("devices", 19, 25).level).toBe("ok");
    expect(usageState("devices", 20, 25).level).toBe("near");
    expect(usageState("devices", 24, 25).level).toBe("near");
    expect(usageState("devices", 25, 25).level).toBe("over");
    expect(usageState("devices", 26, 25).level).toBe("over");
  });
  it("counts nightly per tenant, keeps the last count when one fails, and sums per org", async () => {
    const org = "org-d";
    const a = await tenant(org), b = await tenant(org);
    const counter = new FakeDeviceCounter({ [a.id]: 10, [b.id]: 8 });
    expect(await deviceCountJob(deps, counter)).toMatchObject({ tenants: 2, failed: 0, orgs: 1, overLimit: 0 });
    expect((await orgLimits(deps.db, org, now)).devices).toMatchObject({ used: 18, limit: 25 });
    counter.fail.add(b.id);
    counter.counts[a.id] = 12;
    expect(await deviceCountJob(deps, counter)).toMatchObject({ tenants: 1, failed: 1 });
    expect((await orgLimits(deps.db, org, now)).devices.used).toBe(20);
    expect(limitStates(await orgLimits(deps.db, org, now)).map((u) => u.meter)).toEqual(["devices", "tenants", "catalog_apps"]);
    expect((await orgLimits(deps.db, org, now)).devices.level).toBe("near");
  });
  it("the Free plan: 25 devices, 1 tenant, 15 apps", async () => {
    const org = "org-f";
    await tenant(org);
    const l = await orgLimits(deps.db, org, now);
    expect([l.plan.id, l.devices.limit, l.tenants.limit, l.apps.limit]).toEqual(["free", 25, 1, 15]);
    await expect(assertCanAddTenant(deps.db, org, now)).rejects.toMatchObject({ status: 402, code: "limit_reached" });
    await deps.db.setEntitlement(org, lifetimeEntitlement("professional", "pi_1", now.getTime()));
    await expect(assertCanAddTenant(deps.db, org, now)).resolves.toBeUndefined();
    await expect(assertCanAddTenant(deps.db, "empty-org", now)).resolves.toBeUndefined();
  });
  it("the 16th app is refused on Free, an already published app is not", async () => {
    const org = "org-apps";
    const t = await tenant(org);
    for (let i = 0; i < 15; i++) await deps.db.collection<TenantApp>("tenant_apps").put({ id: `${t.id}:app-${i}`, orgId: org, tenantId: t.id, appSlug: `app-${i}`, autoUpdate: true, createdAt: "", updatedAt: "" });
    await expect(assertCanPublish(deps.db, org, "app-3", now)).resolves.toBeUndefined();
    await expect(assertCanPublish(deps.db, org, "new-app", now)).rejects.toMatchObject({ status: 402, code: "limit_reached" });
    await deps.db.setEntitlement(org, lifetimeEntitlement("starter", "pi_2", now.getTime()));
    await expect(assertCanPublish(deps.db, org, "new-app", now)).resolves.toBeUndefined();
  });
  it("over the device limit: 14 day grace (D-04), then publishing stops until an upgrade", async () => {
    const org = "org-g";
    const t = await tenant(org);
    const counter = new FakeDeviceCounter({ [t.id]: 30 });
    expect(await deviceCountJob(deps, counter)).toMatchObject({ overLimit: 1 });
    const day0 = await orgLimits(deps.db, org, now);
    expect(day0).toMatchObject({ overSince: clock.toISOString(), graceExpired: false });
    expect(day0.graceEndsAt).toBe(days(14).toISOString());
    expect(day0.devices.level).toBe("over");
    await expect(assertCanPublish(deps.db, org, "7-zip", days(13))).resolves.toBeUndefined();
    // A later nightly count keeps the first night.
    now = days(5);
    await deviceCountJob(deps, counter);
    expect((await orgLimits(deps.db, org, now)).overSince).toBe(clock.toISOString());
    await expect(assertCanPublish(deps.db, org, "7-zip", days(14))).rejects.toMatchObject({ status: 402, code: "device_grace_ended" });
    await deps.db.setEntitlement(org, lifetimeEntitlement("starter", "pi_3", clock.getTime()));
    await expect(assertCanPublish(deps.db, org, "7-zip", days(14))).resolves.toBeUndefined();
  });
  it("dropping back under the limit clears the grace clock", async () => {
    const org = "org-h";
    const t = await tenant(org);
    const counter = new FakeDeviceCounter({ [t.id]: 26 });
    await deviceCountJob(deps, counter);
    counter.counts[t.id] = 20;
    await deviceCountJob(deps, counter);
    expect(await orgLimits(deps.db, org, now)).toMatchObject({ overSince: null, graceEndsAt: null, graceExpired: false });
  });
  it("InstallDataDeviceCounter reads Graph install results (largest app)", async () => {
    const org = "org-i";
    const t = await tenant(org);
    const mk = (id: string, appId: string): Deployment => ({ id, orgId: org, tenantId: t.id, appSlug: id, versionId: id, version: "1", variant: "standard", idempotencyKey: id, state: "promoted", step: "done", intuneAppId: appId, contentVersionId: null, fileId: null, sasUri: null, pkg: null, assignments: [], pilotAssignedAt: null, broadAssignedAt: null, failurePct: null, pausedReason: null, error: null, createdAt: "", updatedAt: "" });
    await deps.db.collection<Deployment>("deployments").put(mk("a", "app-a"));
    await deps.db.collection<Deployment>("deployments").put(mk("b", "app-b"));
    const g = graph.forTenant(t.entraTenantId!);
    g.summaries.set("app-a", { installed: 5, failed: 1, pending: 2 });
    g.summaries.set("app-b", { installed: 3, failed: 0, pending: 0 });
    expect(await new InstallDataDeviceCounter(deps).count(t)).toBe(8);
    await deviceCountJob(deps, new InstallDataDeviceCounter(deps));
    expect((await deps.db.collection<DeviceCount>("device_counts").get(t.id))!.count).toBe(8);
  });
});

describe("audit log CSV", () => {
  const e = (over: Partial<AuditEntry>): AuditEntry => ({ id: "x", app: "dockcrate", orgId: "o", actorId: "u1", action: "tenant.created", target: "t1", ip: "203.0.113.7", at: new Date("2026-11-05T10:00:00Z"), ...over });
  it("writes a header and one row per entry with actor, IP and time", () => {
    const csv = auditCsv([e({}), e({ actorId: null, action: "deployment.paused", ip: null, target: null, meta: { app: "7-zip", failurePct: 12 } })]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(AUDIT_CSV_HEADER.join(","));
    expect(lines[1]).toBe("2026-11-05T10:00:00.000Z,u1,tenant.created,t1,203.0.113.7,");
    expect(lines[2]).toBe('2026-11-05T10:00:00.000Z,system,deployment.paused,,,"{""app"":""7-zip"",""failurePct"":12}"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("quotes commas, quotes and newlines and defuses spreadsheet formulas", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell(null)).toBe("");
    expect(csvCell("plain")).toBe("plain");
  });
  it("filters by action prefix, actor, system and date range (to is the end of that day)", () => {
    const rows = [
      e({ id: "1", action: "tenant.created", at: new Date("2026-11-01T00:00:00Z") }),
      e({ id: "2", action: "deployment.paused", actorId: null, at: new Date("2026-11-03T12:00:00Z") }),
      e({ id: "3", action: "deployment.rolled_back", actorId: "u2", at: new Date("2026-11-05T23:59:00Z") }),
    ];
    const ids = (f: string) => filterAudit(rows, parseAuditFilter(new URLSearchParams(f))).map((r) => r.id);
    expect(ids("action=deployment.")).toEqual(["2", "3"]);
    expect(ids("action=tenant.created")).toEqual(["1"]);
    expect(ids("actor=system")).toEqual(["2"]);
    expect(ids("actor=u2")).toEqual(["3"]);
    expect(ids("from=2026-11-02&to=2026-11-05")).toEqual(["2", "3"]);
    expect(ids("from=garbage")).toEqual(["1", "2", "3"]);
  });
  it("exports the whole log across pages from the real store, newest first, and the log has no edit path", async () => {
    const db = deps.db;
    for (let i = 0; i < 1203; i++) await db.appendAudit({ orgId: "org-a", actorId: i % 2 ? "u1" : null, action: i % 3 ? "tenant.created" : "deployment.paused", ip: "198.51.100.2", at: new Date(clock.getTime() + i * 1000) });
    await db.appendAudit({ orgId: "other-org", actorId: "z", action: "secret.action" });
    const all = await collectAudit((o) => db.listAudit("org-a", o), {});
    expect(all).toHaveLength(1203);
    expect(all[0]!.at.getTime()).toBeGreaterThan(all[1202]!.at.getTime());
    expect(all.every((r) => r.orgId === "org-a")).toBe(true);
    expect(auditCsv(all).split("\r\n")).toHaveLength(1203 + 2);
    expect(await collectAudit((o) => db.listAudit("org-a", o), { action: "deployment." })).toHaveLength(401);
    expect(await collectAudit((o) => db.listAudit("org-a", o), {}, 10)).toHaveLength(10);
    expect(Object.keys(db).filter((k) => /audit/i.test(k)).sort()).toEqual(["appendAudit", "auditChain", "listAudit"]);
  });
  it("audit() stores the entry with a null IP when there is no request", async () => {
    const entry = await audit({ orgId: "org-ip", actorId: "u1", action: "x.y" });
    expect(entry.ip ?? null).toBeNull();
    expect((await audit({ orgId: "org-ip", actorId: null, action: "x.z", ip: "192.0.2.1" })).ip).toBe("192.0.2.1");
  });
});

describe("verification pipeline interfaces", () => {
  async function version(slug = "7-zip"): Promise<CatalogVersion> {
    const app = (await deps.db.collection<CatalogApp>("catalog").get(slug))!;
    return (await deps.db.collection<CatalogVersion>("catalog_versions").get(app.currentVersionId))!;
  }
  const sources = (v: CatalogVersion, o: { hash?: string; signer?: string; infected?: boolean; age?: number } = {}) => {
    const url = "https://fake.invalid/x";
    return {
      url,
      downloader: new FakeInstallerDownloader(() => o.hash ?? v.sha256),
      scanner: new FakeScanner(() => o.signer ?? v.signer.thumbprint, { infected: o.infected ? new Set([`fake:${url}`]) : undefined, signatureAgeHours: o.age }),
    };
  };
  it("the fake winget source serves the seed list and nothing else", async () => {
    const w = new FakeWingetSource();
    expect(await w.latest("7zip.7zip")).toMatchObject({ version: "25.01", installerType: expect.any(String) });
    expect(await w.latest("Not.Reviewed")).toBeNull();
    expect(w.manifests.size).toBe(6);
  });
  it("collectEvidence downloads then scans, and refuses a version with no installer URL", async () => {
    const v = await version();
    const s = sources(v);
    await expect(collectEvidence(v, s)).rejects.toBeInstanceOf(NoInstallerUrlError);
    const ev = await collectEvidence(v, s, s.url);
    expect(ev).toEqual({ observedSha256: v.sha256, signerThumbprint: v.signer.thumbprint, scan: { clean: true, signatureAgeHours: 1, detail: undefined } });
    expect(s.downloader.calls).toEqual([s.url]);
    expect(s.scanner.calls).toEqual([`fake:${s.url}`]);
  });
  it("verifyVersion takes downloader and scanner: clean passes 3/4 with VM pending", async () => {
    const v = { ...(await version()), installerUrl: "https://fake.invalid/x" };
    const out = await verifyVersion(v, sources(v), new PendingVmLab(), now, false);
    expect(out.verification.checks).toEqual({ hash: "pass", signer: "pass", scan: "pass", vm: "pending" });
    expect(out.status).toBe("verified_static");
  });
  it("holds on a hash mismatch, a changed signer, EICAR and a stale signature database", async () => {
    const v: CatalogVersion = { ...(await version()), installerUrl: "https://fake.invalid/x", previousSignerThumbprint: "OLD" };
    const lab = new PendingVmLab();
    const run = (o: Parameters<typeof sources>[1], base = v) => verifyVersion(base, sources(base, o), lab, now, false);
    expect((await run({ hash: "0".repeat(64) }, { ...v, previousSignerThumbprint: null })).verification.checks.hash).toBe("fail");
    const signer = await run({});
    expect(signer.verification.checks.signer).toBe("fail");
    expect(signer.status).toBe("held");
    const clean: CatalogVersion = { ...v, previousSignerThumbprint: null };
    const eicar = await run({ infected: true }, clean);
    expect(eicar.verification.checks.scan).toBe("fail");
    expect(eicar.verification.heldReason).toMatch(/Eicar/);
    const stale = await run({ age: 25 }, clean);
    expect(stale.verification.checks.scan).toBe("fail");
    expect(stale.status).toBe("held");
  });
  it("verifyVersion still accepts ready made evidence", async () => {
    const v = await version();
    const out = await verifyVersion(v, { observedSha256: v.sha256, signerThumbprint: v.signer.thumbprint, scan: { clean: true, signatureAgeHours: 0 } }, new PendingVmLab(), now, false);
    expect(out.status).toBe("verified_static");
  });
  it("catalog-sync dry run over the seed list: holds the changed signer, persists nothing", async () => {
    const before = await deps.db.collection<CatalogVersion>("catalog_versions").find();
    const res = await catalogSync(deps.db, await fakePipeline(deps.db, signer, new PendingVmLab(), now));
    expect(res.persisted).toBe(false);
    expect(res.items).toHaveLength(6);
    expect(res.counts).toEqual({ verified_static: 5, held: 1 });
    expect(res.items.find((i) => i.slug === "adobe-acrobat-reader")).toMatchObject({ status: "held", newVersion: false, persisted: false });
    expect(await deps.db.collection<CatalogVersion>("catalog_versions").find()).toEqual(before);
  });
  it("catalog-sync with persistence records a newer winget version as a candidate that cannot publish yet", async () => {
    const opts = await fakePipeline(deps.db, signer, new PendingVmLab(), now);
    const w = opts.winget as FakeWingetSource;
    const cur = w.manifests.get("7zip.7zip")!;
    const next = { ...cur, version: "25.02", sha256: "a".repeat(64), installerUrl: "https://fake.invalid/7zip/25.02" };
    w.manifests.set("7zip.7zip", next);
    const old = await version();
    const dl = new FakeInstallerDownloader(() => next.sha256);
    const sc = new FakeScanner(() => old.signer.thumbprint);
    const res = await catalogSync(deps.db, { ...opts, sources: { downloader: dl, scanner: sc }, persist: true });
    const item = res.items.find((i) => i.slug === "7-zip")!;
    expect(item).toMatchObject({ newVersion: true, version: "25.02", persisted: true, status: "verified_static" });
    const saved = (await deps.db.collection<CatalogVersion>("catalog_versions").get("7-zip@25.02"))!;
    expect(saved.detection).toEqual([]);
    expect(saved.manifestSig).toBeTruthy();
    expect(saved.previousSignerThumbprint).toBe(old.signer.thumbprint);
  });
  it("a missing manifest or a pipeline error is reported per app, never thrown", async () => {
    const opts = await fakePipeline(deps.db, signer, new PendingVmLab(), now);
    (opts.winget as FakeWingetSource).manifests.delete("VideoLAN.VLC");
    const res = await catalogSync(deps.db, { ...opts, sources: { downloader: { name: "boom", download: async () => { throw new Error("egress_blocked"); } }, scanner: opts.sources.scanner } });
    expect(res.items.find((i) => i.slug === "vlc-media-player")).toMatchObject({ status: "skipped", detail: "Not in the reviewed winget list." });
    expect(res.items.find((i) => i.slug === "7-zip")).toMatchObject({ status: "skipped", detail: "egress_blocked" });
  });
  it("the catalog-sync and device-count cron jobs run with fakes and no network", async () => {
    const r = (await cronJobs["catalog-sync"]!()) as { persisted: boolean; items: unknown[] };
    expect(r.persisted).toBe(false);
    expect(r.items).toHaveLength(6);
    expect(await cronJobs["device-count"]!()).toMatchObject({ tenants: expect.any(Number) });
  });
});

describe("MSP overview", () => {
  it("lists out of date apps, paused rings, disconnected tenants and devices; filters narrow them", async () => {
    const org = "org-msp";
    const a = await tenant(org, { name: "Alpha Dental" }), b = await tenant(org, { name: "Bravo Law" }), c = await tenant(org, { name: "Charlie Co" });
    await deps.db.collection<Tenant>("tenants").put({ ...c, status: "disconnected", lastError: "Consent was revoked." });
    const dep = (t: Tenant, slug: string, versionId: string, state: Deployment["state"], extra: Partial<Deployment> = {}): Deployment => ({ id: `${t.id}-${slug}-${versionId}`, orgId: org, tenantId: t.id, appSlug: slug, versionId, version: versionId.split("@")[1]!, variant: "standard", idempotencyKey: `${t.id}:${versionId}`, state, step: "done", intuneAppId: "i", contentVersionId: null, fileId: null, sasUri: null, pkg: null, assignments: [], pilotAssignedAt: null, broadAssignedAt: null, failurePct: null, pausedReason: null, error: null, createdAt: "2026-11-01T00:00:00Z", updatedAt: "", ...extra });
    const deployments = [
      dep(a, "7-zip", "7-zip@24.00", "promoted"),
      dep(a, "google-chrome", "google-chrome@152.0.6913", "promoted"),
      dep(b, "7-zip", "7-zip@25.01", "paused", { pausedReason: "12% failed" }),
    ];
    const { listCatalog } = await import("@/lib/catalog");
    const entries = await listCatalog(deps.db);
    const tenants = await deps.db.collection<Tenant>("tenants").find({ orgId: org });
    const deviceCounts: DeviceCount[] = [{ id: a.id, orgId: org, count: 12, countedAt: "2026-11-05T02:30:00Z" }, { id: b.id, orgId: org, count: 30, countedAt: "2026-11-05T02:30:00Z" }];
    const input = { tenants, deployments, entries, deviceCounts, alerts: [] };
    const all = mspOverview(input);
    expect(all.outdated.map((r) => `${r.tenantName}:${r.slug}`)).toEqual(["Alpha Dental:7-zip"]);
    expect(all.paused.map((r) => `${r.tenantName}:${r.slug}:${r.reason}`)).toEqual(["Bravo Law:7-zip:12% failed"]);
    expect(all.disconnected.map((t) => t.name)).toEqual(["Charlie Co"]);
    expect(all.totals).toEqual({ tenants: 3, devices: 42, outdated: 1, paused: 1, disconnected: 1 });
    expect(all.tenants.find((t) => t.name === "Charlie Co")!.devices).toBeNull();
    expect(mspOverview(input, { kind: "paused" }).outdated).toEqual([]);
    expect(mspOverview(input, { tenant: b.id }).outdated).toEqual([]);
    expect(mspOverview(input, { q: "dental" }).tenants.map((t) => t.name)).toEqual(["Alpha Dental"]);
    expect(mspOverview(input, { kind: "disconnected" }).paused).toEqual([]);
    expect(parseMspFilter({ kind: "bogus", q: " x " })).toEqual({ tenant: undefined, kind: "all", q: "x" });
  });
});

describe("cron configuration", () => {
  it("vercel.json fits Vercel Hobby: two daily entries, and the daily run covers every background job", () => {
    const crons = vercel.crons as { path: string; schedule: string }[];
    expect(crons.length).toBeLessThanOrEqual(2);
    for (const c of crons) {
      expect(c.schedule, c.path).toMatch(/^\d+ \d+ \* \* \*$/);
      expect(cronJobs[c.path.replace("/api/cron/", "")], c.path).toBeTypeOf("function");
    }
    for (const j of ["rings-tick", "device-count", "catalog-sync", "webhook-retries", "tenant-verify", "publish-reconcile"]) expect(DAILY_SEQUENCE, j).toContain(j);
  });
});
