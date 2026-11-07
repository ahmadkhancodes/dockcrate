// Closes the open P1 findings of docs/REVIEW.md (P1-1 consent proof, P1-2 atomic guard, P1-3 orphans, P1-4 download limits, P1-12 alert prefs).
import { generateKeyPairSync, sign } from "node:crypto";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { memberPrefsHooks } from "@/lib/auth";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { generateTestSigner } from "@/lib/catalog/manifest";
import type { CatalogVersion } from "@/lib/catalog/types";
import { getDb } from "@/lib/db";
import { createMemoryDb } from "@/lib/db/memory";
import type { Deps } from "@/lib/deps";
import { FakeGraphFactory } from "@/lib/graph/fake";
import { BufferInstallerSource, UrlInstallerSource } from "@/lib/publish/installer";
import { ABANDON_AFTER_MS, publishReconcile, RECONCILE_AFTER_MS } from "@/lib/publish/reconcile";
import { publishVersion, type PublishCtx } from "@/lib/publish/win32";
import { raiseAlert, type AlertPrefs } from "@/lib/alerts";
import { defaultRingConfig } from "@/lib/rings/engine";
import type { Deployment, RingConfig } from "@/lib/rings/types";
import { buildConsentUrl, createTenant, handleConsentCallback, handleConsentProof, type Tenant } from "@/lib/tenants";
import { HttpError } from "@/lib/http";

let deps: Deps;
let graph: FakeGraphFactory;
let n = 0;
let clock = new Date("2026-11-06T10:00:00Z");
const signer = generateTestSigner();
const ctx = (): PublishCtx => ({ installer: new BufferInstallerSource(Buffer.from("MZ")), signer, maxPolls: 5, sleep: async () => {} });
const entraId = () => `aaaaaaaa-bbbb-cccc-dddd-${String(++n).padStart(12, "0")}`;
const CLIENT = "11111111-2222-3333-4444-555555555555";

beforeEach(async () => {
  clock = new Date("2026-11-06T10:00:00Z");
  process.env.ENTRA_CLIENT_ID = CLIENT;
  globalThis.__kitMemoryDb = createMemoryDb("dockcrate");
  graph = new FakeGraphFactory();
  deps = { db: await getDb(), graph, sendMail: async () => {}, baseUrl: "https://dockcrate.test", now: () => clock };
});

const stateFor = (orgId: string, tenantId: string) => new URL(buildConsentUrl({ baseUrl: deps.baseUrl, orgId, tenantId, clientId: "c", now: clock.getTime() })).searchParams.get("state");

describe("P1-1 consent proof", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" }] };
  const keyFetch = (async () => new Response(JSON.stringify(jwks))) as unknown as typeof fetch;
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const idToken = (claims: Record<string, unknown>, key = privateKey) => {
    const head = b({ alg: "RS256", kid: "k1", typ: "JWT" });
    const body = b(claims);
    return `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url")}`;
  };
  const claimsFor = (tid: string, nonce: string, over: Record<string, unknown> = {}) => ({
    tid, iss: `https://login.microsoftonline.com/${tid}/v2.0`, aud: CLIENT, nonce, exp: Math.floor(clock.getTime() / 1000) + 600, wids: ["62e90394-69f5-4237-9190-012177145e10"], ...over,
  });
  const proofDeps = () => ({ ...deps, requireConsentProof: true, fetch: keyFetch });

  async function start(orgId: string, entra: string) {
    const t = await createTenant(deps, { orgId, name: `T ${orgId}`, actorId: null });
    const r = await handleConsentCallback(proofDeps(), { state: stateFor(orgId, t.id), tenant: entra, admin_consent: "True" });
    return { t, r };
  }
  const parts = (url: string) => { const u = new URL(url); return { state: u.searchParams.get("state")!, nonce: u.searchParams.get("nonce")!, u }; };
  const row = (id: string) => deps.db.collection<Tenant>("tenants").get(id);

  it("a forged callback no longer links an unlinked tenant: it only sends the browser to that tenant's Entra sign in", async () => {
    const entra = entraId();
    const { t, r } = await start("org-a", entra);
    expect(r.ok).toBe(false);
    expect(r.proofUrl).toContain(`https://login.microsoftonline.com/${entra}/oauth2/v2.0/authorize`);
    expect((await row(t.id))!.entraTenantId).toBeNull();
    expect(graph.clients.size).toBe(0);
  });

  it("links after an admin of that tenant signed in (tid matches, signed, nonce, audience)", async () => {
    const entra = entraId();
    const { t, r } = await start("org-a", entra);
    const { state, nonce } = parts(r.proofUrl!);
    const done = await handleConsentProof(proofDeps(), { state, id_token: idToken(claimsFor(entra, nonce)) });
    expect(done.ok).toBe(true);
    expect((await row(t.id))!.entraTenantId).toBe(entra);
  });

  it("refuses a token from another tenant (the attacker's own admin), a non admin, a bad signature, a wrong nonce and an expired one", async () => {
    const entra = entraId();
    const { t, r } = await start("org-a", entra);
    const { state, nonce } = parts(r.proofUrl!);
    const cases: [string, string][] = [
      ["tenant_mismatch", idToken(claimsFor(entraId(), nonce))],
      ["not_admin", idToken(claimsFor(entra, nonce, { wids: [] }))],
      ["signature", idToken(claimsFor(entra, nonce), other.privateKey)],
      ["nonce", idToken(claimsFor(entra, "x"))],
      ["expired", idToken(claimsFor(entra, nonce, { exp: 1 }))],
      ["audience", idToken(claimsFor(entra, nonce, { aud: "someone-else" }))],
    ];
    for (const [, tok] of cases) {
      const res = await handleConsentProof(proofDeps(), { state, id_token: tok });
      expect(res.ok).toBe(false);
      expect((await row(t.id))!.entraTenantId).toBeNull();
    }
    expect((await handleConsentProof(proofDeps(), { state, id_token: null })).ok).toBe(false);
    expect((await handleConsentProof(proofDeps(), { state: "garbage", id_token: idToken(claimsFor(entra, nonce)) })).ok).toBe(false);
    // a consent state is not a proof state
    expect((await handleConsentProof(proofDeps(), { state: stateFor("org-a", t.id), id_token: idToken(claimsFor(entra, nonce)) })).ok).toBe(false);
  });

  it("a tenant claimed by another org stays refused even with a valid proof", async () => {
    const entra = entraId();
    const a = await start("org-a", entra);
    await handleConsentProof(proofDeps(), { state: parts(a.r.proofUrl!).state, id_token: idToken(claimsFor(entra, parts(a.r.proofUrl!).nonce)) });
    const b2 = await createTenant(deps, { orgId: "org-b", name: "Tenant B", actorId: null });
    const r = await handleConsentCallback(proofDeps(), { state: stateFor("org-b", b2.id), tenant: entra, admin_consent: "True" });
    expect(r.proofUrl).toBeUndefined();
    expect(r.message).toMatch(/another DockCrate organization/);
  });
});

describe("P1-2 atomic publish guard", () => {
  async function setup() {
    await ensureCatalogSeeded(deps.db, signer, clock);
    const t = await createTenant(deps, { orgId: "org-1", name: "Tenant One", actorId: null });
    const entra = entraId();
    await handleConsentCallback(deps, { state: stateFor("org-1", t.id), tenant: entra, admin_consent: "True" });
    const tenant = (await deps.db.collection<Tenant>("tenants").get(t.id))!;
    await deps.db.collection<RingConfig>("ring_configs").put(defaultRingConfig(tenant, { id: "g-pilot", name: "Pilot" }, { id: "g-broad", name: "Broad" }));
    const v = { id: "7-zip@25.01" };
    return { tenant, versionId: v.id, client: graph.forTenant(entra) };
  }

  it("claim() is compare-and-set: one of many racers wins", async () => {
    const col = deps.db.collection<{ id: string; lease: string | null }>("race");
    await col.put({ id: "a", lease: null });
    const wins = await Promise.all(Array.from({ length: 10 }, (_, i) => col.claim("a", { lease: null }, { lease: `w${i}` })));
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(await col.claim("missing", {}, { lease: "x" })).toBeNull();
    expect(await col.insertIfAbsent({ id: "a", lease: "dup" })).toBe(false);
  });

  it("ten simultaneous first publishes create exactly one deployment and one Intune app", async () => {
    const { tenant, versionId, client } = await setup();
    const res = await Promise.allSettled(Array.from({ length: 10 }, () => publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of res) if (r.status === "rejected") expect((r.reason as HttpError).code).toBe("publish_in_progress");
    expect(client.calls.filter((c) => c === "createWin32App")).toHaveLength(1);
    expect(await deps.db.collection<Deployment>("deployments").find({ tenantId: tenant.id })).toHaveLength(1);
  });

  it("ten simultaneous resumes of an expired lease let one through", async () => {
    const { tenant, versionId, client } = await setup();
    client.failNext.set("createContentVersion", 1);
    await expect(publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null })).rejects.toThrow();
    const res = await Promise.allSettled(Array.from({ length: 10 }, () => publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(client.calls.filter((c) => c === "createWin32App")).toHaveLength(1);
  });

  describe("P1-3 orphaned apps and the reconciler", () => {
    const crashAfterCreate = (client: ReturnType<FakeGraphFactory["forTenant"]>) => {
      const orig = client.createWin32App.bind(client);
      client.createWin32App = async (b) => { await orig(b); throw new Error("function_killed"); };
    };
    const only = async () => (await deps.db.collection<Deployment>("deployments").find())[0]!;

    it("records the intent before the Graph call and a retry adopts the app it created", async () => {
      const { tenant, versionId, client } = await setup();
      const orig = client.createWin32App.bind(client);
      crashAfterCreate(client);
      await expect(publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null })).rejects.toThrow();
      const d = await only();
      expect(d.intuneAppId).toBeNull();
      expect(d.createStartedAt).toBeTruthy();
      client.createWin32App = orig;
      hoursLater(0.2);
      const done = await publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null });
      expect(done.step).toBe("done");
      expect(client.apps.size).toBe(1);
    });

    const hoursLater = (h: number) => { clock = new Date(clock.getTime() + h * 3_600_000); };

    it("publish-reconcile adopts the orphan and finishes the upload", async () => {
      const { tenant, versionId, client } = await setup();
      crashAfterCreate(client);
      await expect(publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null })).rejects.toThrow();
      expect((await publishReconcile(deps, ctx())).checked).toBe(0); // too fresh
      clock = new Date(clock.getTime() + RECONCILE_AFTER_MS + 1000);
      const r = await publishReconcile(deps, ctx());
      expect(r).toMatchObject({ checked: 1, adopted: 1, finished: 1, failed: 0 });
      const d = await only();
      expect(d.state).toBe("assigned");
      expect(d.intuneAppId).toBe([...client.apps.keys()][0]);
      expect(client.apps.size).toBe(1);
    });

    it("retries the create when the crash happened before Graph created anything", async () => {
      const { tenant, versionId, client } = await setup();
      client.failNext.set("createWin32App", 1);
      await expect(publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null })).rejects.toThrow();
      clock = new Date(clock.getTime() + RECONCILE_AFTER_MS + 1000);
      const r = await publishReconcile(deps, ctx());
      expect(r).toMatchObject({ adopted: 0, finished: 1 });
      expect(client.apps.size).toBe(1);
    });

    it("removes a duplicate app with the same name that nothing records", async () => {
      const { tenant, versionId, client } = await setup();
      crashAfterCreate(client);
      await expect(publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null })).rejects.toThrow();
      const first = [...client.apps.values()][0]!;
      await client.createWin32App(first.body).catch(() => {}); // a second crashed create
      expect(client.apps.size).toBe(2);
      clock = new Date(clock.getTime() + RECONCILE_AFTER_MS + 1000);
      const r = await publishReconcile(deps, ctx());
      expect(r.removed).toBe(1);
      expect(client.apps.size).toBe(1);
    });

    it("abandons an upload that never finished: deletes its app and marks it failed", async () => {
      const { tenant, versionId, client } = await setup();
      crashAfterCreate(client);
      await expect(publishVersion(deps, ctx(), { orgId: "org-1", tenantId: tenant.id, versionId, actorId: null })).rejects.toThrow();
      clock = new Date(clock.getTime() + ABANDON_AFTER_MS + 1000);
      const r = await publishReconcile(deps, ctx());
      expect(r.removed).toBe(1);
      expect(client.apps.size).toBe(0);
      expect((await only()).state).toBe("failed");
    });
  });
});

describe("P1-4 installer download limits", () => {
  const body = Buffer.from("hello installer");
  const sha = "6dcb4b3b8f6bd1a2dc4f2d0bbc0f2f1c3a1e7a5d3ac4fa2d4a8a2f0f6a8a4a0f";
  const version = (url: string | null, sha256 = "") => ({ id: "x@1", appSlug: "x", setupFile: "setup.exe", installerUrl: url, sha256 }) as unknown as CatalogVersion;
  const hashOf = async () => (await import("node:crypto")).createHash("sha256").update(body).digest("hex");
  const res = (b: Buffer, init: ResponseInit = {}) => new Response(Readable.toWeb(Readable.from([b])) as never, init);
  const drain = async (s: { data: unknown }) => { let t = 0; for await (const c of s.data as AsyncIterable<Buffer>) t += c.length; return t; };
  void sha;

  it("downloads over https and checks the hash", async () => {
    const src = new UrlInstallerSource((async () => res(body)) as never);
    expect(await drain(await src.open(version("https://vendor.test/a.exe", await hashOf())))).toBe(body.length);
    await expect(src.open(version("https://vendor.test/a.exe", "00"))).rejects.toMatchObject({ code: "installer_hash_mismatch" });
  });

  it("refuses plain http and a missing url", async () => {
    const src = new UrlInstallerSource((async () => res(body)) as never);
    await expect(src.open(version("http://vendor.test/a.exe"))).rejects.toMatchObject({ code: "installer_download_not_available" });
    await expect(src.open(version(null))).rejects.toMatchObject({ code: "installer_download_not_available" });
  });

  it("stops at the byte cap, by header and by counting a stream that lies", async () => {
    const big = Buffer.alloc(2048, 1);
    const byHeader = new UrlInstallerSource((async () => res(big, { headers: { "content-length": "2048" } })) as never, { maxBytes: 1024 });
    await expect(byHeader.open(version("https://vendor.test/a.exe", "00"))).rejects.toMatchObject({ code: "installer_too_large" });
    const liar = new UrlInstallerSource((async () => res(big)) as never, { maxBytes: 1024 });
    await expect(liar.open(version("https://vendor.test/a.exe", "00"))).rejects.toMatchObject({ code: "installer_too_large" });
  });

  it("times out a stalled download", async () => {
    const stalled = (async (_u: string, init?: RequestInit) => new Promise<Response>((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as never;
    await expect(new UrlInstallerSource(stalled, { timeoutMs: 30 }).open(version("https://vendor.test/a.exe", "00"))).rejects.toMatchObject({ code: "installer_download_timeout" });
  });

  it("follows redirects on the same host only, never to another host or to http, and only so many", async () => {
    const hashed = await hashOf();
    const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
    const calls: string[] = [];
    const same = new UrlInstallerSource((async (u: string, init?: RequestInit) => {
      calls.push(u);
      expect(init?.redirect).toBe("manual");
      return u.endsWith("/a.exe") ? redirect("/cdn/b.exe") : res(body);
    }) as never);
    expect(await drain(await same.open(version("https://vendor.test/a.exe", hashed)))).toBe(body.length);
    expect(calls).toEqual(["https://vendor.test/a.exe", "https://vendor.test/cdn/b.exe"]);
    for (const to of ["https://evil.test/x.exe", "http://vendor.test/x.exe", "https://vendor.test.evil.test/x"]) {
      const src = new UrlInstallerSource((async () => redirect(to)) as never);
      await expect(src.open(version("https://vendor.test/a.exe", hashed))).rejects.toMatchObject({ code: "installer_redirect_refused" });
    }
    const loop = new UrlInstallerSource((async () => redirect("https://vendor.test/a.exe")) as never, { maxRedirects: 2 });
    await expect(loop.open(version("https://vendor.test/a.exe", hashed))).rejects.toMatchObject({ code: "installer_redirect_refused" });
  });
});

describe("P1-12 alert preferences exist from the day a member is added", () => {
  it("every hook writes the row, so a member who never opened the app gets the critical email", async () => {
    const sent: string[] = [];
    deps = { ...deps, sendMail: async (m) => { sent.push(m.to as string); } };
    const h = memberPrefsHooks();
    await h.afterCreateOrganization({ member: { organizationId: "org-1", userId: "u-owner", role: "owner" }, user: { email: "Owner@msp.test" } });
    await h.afterAddMember({ member: { organizationId: "org-1", userId: "u-op", role: "operator" }, user: { email: "op@msp.test" } });
    await h.afterAcceptInvitation({ member: { organizationId: "org-1", userId: "u-v", role: "viewer" }, user: { email: "viewer@msp.test" } });
    const rows = await deps.db.collection<AlertPrefs>("alert_prefs").find({ orgId: "org-1" });
    expect(rows.map((r) => r.email).sort()).toEqual(["op@msp.test", "owner@msp.test", "viewer@msp.test"]);
    await raiseAlert(deps, { orgId: "org-1", tenantId: null, severity: "critical", kind: "tenant.disconnected", message: "gone" });
    expect(sent.sort()).toEqual(["op@msp.test", "owner@msp.test", "viewer@msp.test"]);
    await h.afterUpdateMemberRole({ member: { organizationId: "org-1", userId: "u-op", role: "admin" }, user: { email: "op@msp.test" } });
    expect((await deps.db.collection<AlertPrefs>("alert_prefs").get("org-1:u-op"))!.role).toBe("admin");
  });
});
