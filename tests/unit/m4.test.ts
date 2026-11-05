import { beforeEach, describe, expect, it } from "vitest";
import { acknowledge, alertDigestJob, ensurePrefs, listAlertsFor, raiseAlert, raiseSignerChanged, routeAlert, savePrefs, defaultPrefs, ALERT_KINDS } from "@/lib/alerts";
import { chainEntry, verifyChain } from "@/lib/audit-chain";
import { audit } from "@/lib/audit";
import { authorize, canAccess, filterTenants, type Membership } from "@/lib/authz";
import { getMembership, setTenantScope } from "@/lib/auth/scope";
import { FakeDeviceCounter } from "@/lib/billing/devices";
import { deviceCountJob } from "@/lib/billing/limits";
import { facets, filterCatalog } from "@/lib/catalog/filter";
import { listCatalog, listVersions } from "@/lib/catalog";
import { toRow } from "@/lib/catalog/view";
import { generateTestSigner } from "@/lib/catalog/manifest";
import { product } from "@/config/product";
import { getLegalDoc, legalDocs } from "@/content/legal";
import { getDb } from "@/lib/db";
import { createMemoryDb } from "@/lib/db/memory";
import type { Deps } from "@/lib/deps";
import { FakeGraphFactory } from "@/lib/graph/fake";
import { legalHtml } from "@/lib/legal-html";
import { updateMemberScope } from "@/lib/members";
import type { TenantApp } from "@/lib/rings/types";
import { createTenant, type Alert, type Tenant } from "@/lib/tenants";
import { cronJobs } from "@/lib/cron/jobs";
import { docs } from "@/content/docs";
import vercel from "../../vercel.json";

const clock = new Date("2026-11-05T10:00:00Z");
let now = clock;
let deps: Deps;
let mails: { to: string; subject: string; category?: string }[];
const days = (d: number) => new Date(clock.getTime() + d * 86_400_000);

async function tenant(orgId: string, name: string, connected = false): Promise<Tenant> {
  const t = await createTenant(deps, { orgId, name, actorId: "u1" });
  if (!connected) return t;
  const c = { ...t, status: "connected" as const, entraTenantId: `e-${name}` };
  await deps.db.collection<Tenant>("tenants").put(c);
  return c;
}
const person = (orgId: string, userId: string, role: string) => ({ orgId, userId, email: `${userId}@msp.test`, role });

beforeEach(async () => {
  now = clock;
  mails = [];
  globalThis.__kitMemoryDb = createMemoryDb("dockcrate");
  deps = { db: await getDb(), graph: new FakeGraphFactory(), sendMail: async (m) => { mails.push(m as never); }, baseUrl: "https://dockcrate.test", now: () => now };
});

describe("alert routing matrix", () => {
  const all: Membership = { role: "operator", tenantScope: "all" };
  const base = defaultPrefs("o", "u", "u@x.test", "operator");
  const crit = { severity: "critical" as const, tenantId: "t1" };
  const warn = { severity: "warning" as const, tenantId: "t1" };

  it("defaults: critical goes to the centre and to email at once; so does a warning", () => {
    expect(routeAlert(crit, base, all)).toEqual({ inApp: true, email: "instant" });
    expect(routeAlert(warn, base, all)).toEqual({ inApp: true, email: "instant" });
  });
  it("email off stops all email but critical stays in the centre", () => {
    const p = { ...base, emailOn: false, inApp: false };
    expect(routeAlert(crit, p, all)).toEqual({ inApp: true, email: "none" });
    expect(routeAlert(warn, p, all)).toEqual({ inApp: false, email: "none" });
  });
  it("the daily digest batches non critical alerts only", () => {
    const p = { ...base, digest: "daily" as const };
    expect(routeAlert(crit, p, all).email).toBe("instant");
    expect(routeAlert(warn, p, all).email).toBe("digest");
  });
  it("a muted tenant silences email and warnings but not critical in-app", () => {
    const p = { ...base, mutedTenants: ["t1"] };
    expect(routeAlert(crit, p, all)).toEqual({ inApp: true, email: "none" });
    expect(routeAlert(warn, p, all)).toEqual({ inApp: false, email: "none" });
    expect(routeAlert({ severity: "warning", tenantId: "t2" }, p, all).email).toBe("instant");
  });
  it("scope: a scoped technician gets nothing for other tenants, owners and admins always get it", () => {
    const scoped: Membership = { role: "operator", tenantScope: ["t2"] };
    expect(routeAlert(crit, base, scoped)).toEqual({ inApp: false, email: "none" });
    expect(routeAlert({ severity: "critical", tenantId: "t2" }, base, scoped).inApp).toBe(true);
    expect(routeAlert(crit, base, { role: "admin", tenantScope: ["t2"] }).inApp).toBe(true);
    expect(routeAlert({ severity: "critical", tenantId: null }, base, scoped).inApp).toBe(true);
  });
  it("covers the five critical kinds", () => {
    expect([...ALERT_KINDS].sort()).toEqual(["consent.revoked", "device.grace_ending", "ring.paused", "signer.changed", "tenant.disconnected"]);
  });
});

describe("alert dispatch, centre and acknowledge", () => {
  it("sends the email to opted-in members in scope and stores one in-app alert; extra address is deduped", async () => {
    const t1 = await tenant("o1", "Alpha");
    const t2 = await tenant("o1", "Beta");
    await ensurePrefs(deps, person("o1", "owner", "owner"));
    await ensurePrefs(deps, person("o1", "tech", "operator"));
    await setTenantScope(deps.db, "o1", "tech", [t2.id]);
    await ensurePrefs(deps, person("o1", "mute", "admin"));
    await savePrefs(deps, person("o1", "mute", "admin"), { emailOn: false });
    const a = await raiseAlert(deps, { orgId: "o1", tenantId: t1.id, severity: "critical", kind: "ring.paused", message: "7-zip paused", extraEmails: ["owner@msp.test", "noc@msp.test"] });
    expect(mails.map((m) => m.to).sort()).toEqual(["noc@msp.test", "owner@msp.test"]);
    expect(mails.every((m) => m.category === "transactional" && m.subject.startsWith("Ring paused: Alpha"))).toBe(true);
    expect((await listAlertsFor(deps, person("o1", "owner", "owner"))).unread).toBe(1);
    expect((await listAlertsFor(deps, person("o1", "tech", "operator"))).alerts).toEqual([]);
    expect((await listAlertsFor(deps, person("o1", "mute", "admin"))).alerts).toHaveLength(1);
    expect(a.ackAt).toBeNull();
  });
  it("dedupeKey raises one alert for a repeated cause", async () => {
    const x = { orgId: "o1", tenantId: null, severity: "critical" as const, kind: "device.grace_ending", message: "m", dedupeKey: "k1" };
    await ensurePrefs(deps, person("o1", "owner", "owner"));
    const a = await raiseAlert(deps, x);
    const b = await raiseAlert(deps, x);
    expect(b.id).toBe(a.id);
    expect(mails).toHaveLength(1);
  });
  it("acknowledge one or all; a technician cannot touch an out-of-scope alert; other orgs are invisible", async () => {
    const t1 = await tenant("o1", "Alpha");
    const t2 = await tenant("o1", "Beta");
    await setTenantScope(deps.db, "o1", "tech", [t2.id]);
    const a1 = await raiseAlert(deps, { orgId: "o1", tenantId: t1.id, severity: "critical", kind: "tenant.disconnected", message: "1" });
    await raiseAlert(deps, { orgId: "o1", tenantId: t2.id, severity: "critical", kind: "ring.paused", message: "2" });
    const other = await raiseAlert(deps, { orgId: "o2", tenantId: null, severity: "critical", kind: "ring.paused", message: "3" });
    const tech = person("o1", "tech", "operator");
    await expect(acknowledge(deps, tech, a1.id)).rejects.toMatchObject({ status: 404 });
    await expect(acknowledge(deps, tech, other.id)).rejects.toMatchObject({ status: 404 });
    expect(await acknowledge(deps, tech, "all")).toBe(1);
    expect((await listAlertsFor(deps, tech)).unread).toBe(0);
    const owner = person("o1", "owner", "owner");
    expect((await listAlertsFor(deps, owner)).unread).toBe(1);
    expect(await acknowledge(deps, owner, a1.id)).toBe(1);
    expect((await deps.db.collection<Alert>("alerts").get(a1.id))).toMatchObject({ ackBy: "owner" });
    expect((await listAlertsFor(deps, owner)).unread).toBe(0);
  });
  it("daily digest: one email with the non critical alerts since the last digest, none for critical", async () => {
    const me = person("o1", "owner", "owner");
    await savePrefs(deps, me, { digest: "daily" });
    await raiseAlert(deps, { orgId: "o1", tenantId: null, severity: "warning", kind: "device.grace_ending", message: "w1" });
    await raiseAlert(deps, { orgId: "o1", tenantId: null, severity: "critical", kind: "ring.paused", message: "c1" });
    expect(mails.map((m) => m.subject)).toHaveLength(1); // only the critical one, at once
    mails.length = 0;
    now = days(1);
    expect(await alertDigestJob(deps)).toEqual({ users: 1, sent: 1 });
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toContain("1 alert");
    expect(await alertDigestJob(deps)).toEqual({ users: 1, sent: 0 });
  });
  it("device grace ending alerts 3 days before the stop and again when it ends, once each", async () => {
    const t = await tenant("o1", "Alpha", true);
    await ensurePrefs(deps, person("o1", "owner", "owner"));
    const counter = new FakeDeviceCounter({ [t.id]: 30 });
    await deviceCountJob(deps, counter); // day 0: over limit, 14 days left, no alert
    expect(await deps.db.collection<Alert>("alerts").find({ orgId: "o1" })).toHaveLength(0);
    now = days(12);
    await deviceCountJob(deps, counter);
    await deviceCountJob(deps, counter);
    const ending = await deps.db.collection<Alert>("alerts").find({ orgId: "o1", kind: "device.grace_ending" });
    expect(ending).toHaveLength(1);
    expect(ending[0]!.message).toMatch(/2 days/);
    now = days(15);
    await deviceCountJob(deps, counter);
    expect(await deps.db.collection<Alert>("alerts").find({ orgId: "o1", kind: "device.grace_ending" })).toHaveLength(2);
    expect(mails).toHaveLength(2);
  });
  it("signer changed alerts each org that has the app, once per version", async () => {
    await deps.db.collection<TenantApp>("tenant_apps").put({ id: "t1:7-zip", orgId: "o1", tenantId: "t1", appSlug: "7-zip", autoUpdate: true, createdAt: "", updatedAt: "" });
    expect(await raiseSignerChanged(deps, "7-zip", "26.0")).toBe(1);
    await raiseSignerChanged(deps, "7-zip", "26.0");
    expect(await deps.db.collection<Alert>("alerts").find({ kind: "signer.changed" })).toHaveLength(1);
    expect(await raiseSignerChanged(deps, "vlc", "1")).toBe(0);
  });
  it("the alert digest cron job is registered and scheduled", () => {
    expect(cronJobs["alert-digest"]).toBeTypeOf("function");
    expect((vercel.crons as { path: string }[]).map((c) => c.path)).toContain("/api/cron/alert-digest");
  });
});

describe("members and tenant scope", () => {
  const owner: Membership = { role: "owner", tenantScope: "all" };
  const admin: Membership = { role: "admin", tenantScope: "all" };
  const scopedOp: Membership = { role: "operator", tenantScope: ["a"] };
  const allOp: Membership = { role: "operator", tenantScope: "all" };
  const viewer: Membership = { role: "viewer", tenantScope: ["a"] };

  it("authorize() per role and scope", () => {
    expect(canAccess(owner, "deployment", "publish", "z")).toBe(true);
    expect(canAccess(admin, "tenant", "connect", "z")).toBe(true);
    expect(canAccess(scopedOp, "deployment", "publish", "a")).toBe(true);
    expect(canAccess(scopedOp, "deployment", "publish", "b")).toBe(false);
    expect(canAccess(allOp, "deployment", "rollback", "b")).toBe(true);
    expect(canAccess(allOp, "tenant", "connect", "b")).toBe(false);
    expect(canAccess(allOp, "ring", "configure", "b")).toBe(false);
    expect(canAccess(viewer, "tenant", "read", "a")).toBe(true);
    expect(canAccess(viewer, "tenant", "read", "b")).toBe(false);
    expect(canAccess(viewer, "deployment", "publish", "a")).toBe(false);
    expect(canAccess({ role: "nobody", tenantScope: "all" }, "tenant", "read")).toBe(false);
    expect(() => authorize(scopedOp, "tenant", "read", "b")).toThrowError("forbidden");
    expect(filterTenants(scopedOp, [{ id: "a" }, { id: "b" }])).toEqual([{ id: "a" }]);
    expect(filterTenants(admin, [{ id: "a" }, { id: "b" }])).toHaveLength(2);
  });
  it("only owners and admins can edit scope", async () => {
    const t = await tenant("o1", "Alpha");
    const input = { actorId: "x", orgId: "o1", userId: "tech", targetRole: "operator", scope: [t.id] };
    await expect(updateMemberScope(deps, { ...input, actor: allOp })).rejects.toMatchObject({ status: 403 });
    await expect(updateMemberScope(deps, { ...input, actor: viewer })).rejects.toMatchObject({ status: 403 });
    await expect(updateMemberScope(deps, { ...input, actor: admin })).resolves.toEqual([t.id]);
    await expect(updateMemberScope(deps, { ...input, actor: owner, scope: "all" })).resolves.toBe("all");
  });
  it("validates the scope: not for admins, no empty list, no foreign tenants; saves and audits", async () => {
    const mine = await tenant("o1", "Alpha");
    const foreign = await tenant("o2", "Other");
    const base = { actor: owner, actorId: "boss", orgId: "o1", userId: "tech", targetRole: "operator" };
    await expect(updateMemberScope(deps, { ...base, targetRole: "admin", scope: [mine.id] })).rejects.toMatchObject({ code: "scope_not_applicable" });
    await expect(updateMemberScope(deps, { ...base, scope: [] })).rejects.toMatchObject({ code: "scope_empty" });
    await expect(updateMemberScope(deps, { ...base, scope: [foreign.id] })).rejects.toMatchObject({ code: "unknown_tenant" });
    await updateMemberScope(deps, { ...base, scope: [mine.id, mine.id] });
    expect(await getMembership(deps.db, "o1", "tech", "operator")).toEqual({ role: "operator", tenantScope: [mine.id] });
    const log = await deps.db.listAudit("o1");
    expect(log.find((e) => e.action === "member.scope_changed")).toMatchObject({ actorId: "boss", target: "tech", meta: { count: 1 } });
    await updateMemberScope(deps, { ...base, targetRole: "viewer", scope: "all" });
    expect((await getMembership(deps.db, "o1", "tech", "viewer")).tenantScope).toBe("all");
  });
});

describe("audit hash chain", () => {
  it("chains entries per org and verifies", async () => {
    for (let i = 0; i < 4; i++) await audit({ orgId: "o1", actorId: "u", action: `a.${i}`, meta: { i } });
    await audit({ orgId: "o2", actorId: "u", action: "other" });
    const chain = await deps.db.auditChain("o1");
    expect(chain.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(chain[0]!.prevHash).toBeNull();
    expect(chain[1]!.prevHash).toBe(chain[0]!.hash);
    expect(await verifyChain(chain)).toMatchObject({ ok: true, checked: 4, legacy: 0, headHash: chain[3]!.hash });
    expect((await deps.db.auditChain("o2"))[0]!.seq).toBe(1);
    expect(await verifyChain([])).toMatchObject({ ok: true, checked: 0 });
  });
  it("detects an edited entry, a removed entry, a swapped order and a forged hash", async () => {
    for (let i = 0; i < 5; i++) await audit({ orgId: "o1", actorId: "u", action: `a.${i}`, target: `t${i}` });
    const chain = await deps.db.auditChain("o1");
    const edited = structuredClone(chain); edited[2]!.actorId = "mallory";
    expect(await verifyChain(edited)).toMatchObject({ ok: false, checked: 2, broken: { seq: 3, reason: "hash_mismatch" } });
    const metaEdit = structuredClone(chain); metaEdit[1]!.meta = { x: 1 };
    expect((await verifyChain(metaEdit)).broken).toMatchObject({ seq: 2, reason: "hash_mismatch" });
    const removed = chain.filter((_, i) => i !== 2);
    expect((await verifyChain(removed)).broken).toMatchObject({ seq: 4, reason: "gap" });
    const swapped = [chain[0]!, chain[2]!, chain[1]!, chain[3]!, chain[4]!];
    expect((await verifyChain(swapped)).ok).toBe(false);
    const forged = structuredClone(chain);
    forged[3] = { ...(await chainEntry({ ...forged[3]!, action: "forged" }, forged[1]!)), seq: 4 };
    expect((await verifyChain(forged)).broken).toMatchObject({ seq: 4, reason: "prev_mismatch" });
    const head = await verifyChain(chain.slice(0, 3));
    expect(head.ok).toBe(true); // documented limit: dropping the newest entries is not detectable
  });
  it("entries from before the chain are legacy; an unchained entry after the chain started is a break", async () => {
    await audit({ orgId: "o1", actorId: "u", action: "a" });
    const [first] = await deps.db.auditChain("o1");
    const legacy = { ...first!, id: "old", seq: undefined, hash: undefined, prevHash: undefined };
    expect(await verifyChain([legacy, first!])).toMatchObject({ ok: true, legacy: 1, checked: 1 });
    expect((await verifyChain([first!, legacy])).broken?.reason).toBe("unchained_after_chain");
  });
});

describe("public catalog", () => {
  it("filters by search, publisher, category and status on the seed, fast", async () => {
    const rows = (await listCatalog(deps.db)).map(toRow);
    const t0 = performance.now();
    expect(filterCatalog(rows, {})).toHaveLength(6);
    expect(filterCatalog(rows, { q: "zip" }).map((r) => r.slug)).toEqual(["7-zip"]);
    expect(filterCatalog(rows, { q: "GOOGLE" }).map((r) => r.slug)).toEqual(["google-chrome"]);
    expect(filterCatalog(rows, { publisher: "Google LLC" })).toHaveLength(1);
    expect(filterCatalog(rows, { category: "Browsers" }).map((r) => r.slug)).toEqual(["google-chrome"]);
    expect(filterCatalog(rows, { status: "static" }).length).toBe(rows.filter((r) => r.status === "verified_static").length);
    expect(filterCatalog(rows, { status: "inspected" })).toHaveLength(0); // no VM lab yet: nothing is 4/4
    expect(filterCatalog(rows, { q: "zip", category: "Browsers" })).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(300);
    const f = facets(rows);
    expect(f.categories).toContain("Browsers");
    expect(f.publishers).toEqual([...f.publishers].sort());
  });
  it("every seed row is labelled demo data and keeps a version history with its QA log", async () => {
    const entries = await listCatalog(deps.db);
    expect(entries.map(toRow).every((r) => r.demo)).toBe(true);
    const hist = await listVersions(deps.db, "7-zip");
    expect(hist).toHaveLength(1);
    expect(hist[0]!.verification.qaLog.map((q) => q.step)).toEqual(["hash", "signer", "scan", "vm"]);
    void generateTestSigner;
  });
});

describe("DPA and sub-processors", () => {
  it("the subprocessors page lists exactly product.ts, and the DPA download carries the same list", () => {
    const sub = getLegalDoc("subprocessors")!;
    const table = sub.sections.flatMap((s) => s.body).find((b) => typeof b === "object" && "table" in b) as { table: { rows: string[][] } };
    expect(table.table.rows).toEqual(product.subProcessors.map((s) => [s.name, s.purpose, s.location]));
    const html = legalHtml(getLegalDoc("dpa")!, { subprocessorAnnex: true });
    for (const s of product.subProcessors) expect(html).toContain(s.name.replace(/&/g, "&amp;"));
    const annex = html.slice(html.indexOf("Annex 1"));
    expect((annex.match(/<tr><td>/g) ?? []).length).toBe(product.subProcessors.length);
  });
  it("the HTML is standalone and print friendly, with escaped text", () => {
    const html = legalHtml({ slug: "x", title: "T <b>", description: "", sections: [{ id: "a", title: "S", body: ["a & b", { list: ["<i>"] }] }] });
    expect(html).toContain("@media print");
    expect(html).not.toMatch(/<script|https?:\/\/(?!dockcrate)/);
    expect(html).toContain("T &lt;b&gt;");
    expect(html).toContain("&lt;i&gt;");
  });
  it("every legal doc and docs page is present and docs cover the M4 set", () => {
    expect(legalDocs.map((d) => d.slug)).toEqual(expect.arrayContaining(["dpa", "subprocessors", "security"]));
    expect(docs.map((d) => d.slug)).toEqual(expect.arrayContaining(["getting-started", "connect-a-tenant", "rings", "rollback", "app-sets", "billing", "faq"]));
  });
});
