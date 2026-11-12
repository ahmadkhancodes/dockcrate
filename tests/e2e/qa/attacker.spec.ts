import { expect, request as pwRequest, test, type APIRequestContext } from "@playwright/test";
import { magicLink } from "./helpers";

// Adversarial review (docs/SECURITY-REVIEW.md): a signed-in attacker in organisation B against a victim in organisation A.
// Request based only (no browser), so it runs where Chromium is not installed.

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

interface Actor { api: APIRequestContext; email: string; orgId: string; userId: string; origin: string }

async function signIn(baseURL: string, email: string, request: APIRequestContext, xff = ip()): Promise<APIRequestContext> {
  const api = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL, "x-forwarded-for": xff } });
  const r = await api.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" } });
  expect(r.status(), await r.text()).toBe(200);
  const link = await magicLink(request, email);
  const v = await api.get(link, { maxRedirects: 0 });
  expect([200, 302, 307]).toContain(v.status());
  return api;
}

async function actor(baseURL: string, request: APIRequestContext, name: string): Promise<Actor> {
  const email = `${name}+${Date.now()}${Math.floor(Math.random() * 1e4)}@msp.test`;
  const api = await signIn(baseURL, email, request);
  const org = await api.post("/api/auth/organization/create", { data: { name: `${name} MSP`, slug: `${name}-${Date.now()}-${Math.floor(Math.random() * 1e5)}` } });
  expect(org.status(), await org.text()).toBe(200);
  const orgId = (await org.json()).id as string;
  await api.post("/api/auth/organization/set-active", { data: { organizationId: orgId } });
  const s = await (await api.get("/api/auth/get-session")).json();
  return { api, email, orgId, userId: s.user.id, origin: baseURL };
}

test.describe.configure({ mode: "serial" });

test("tenant isolation: organisation B cannot read, change or delete anything of organisation A", async ({ baseURL, request }) => {
  const a = await actor(baseURL!, request, "victim");
  const b = await actor(baseURL!, request, "attacker");

  // Victim creates resources.
  const wh = await a.api.post("/api/webhooks", { data: { url: "https://hooks.example.com/a", events: ["*"] } });
  expect(wh.status()).toBe(201);
  const whId = (await wh.json()).endpoint.id as string;
  const t = await a.api.post("/api/tenants", { data: { name: "Victim tenant" } });
  const tenantId = t.status() === 201 ? ((await t.json()).tenant.id as string) : "00000000-0000-7000-8000-000000000000";

  // Attacker tries every route with the victim's ids.
  const tries: [string, Promise<{ status(): number; text(): Promise<string> }>][] = [
    ["GET tenant", b.api.get(`/api/tenants/${tenantId}`)],
    ["GET tenant groups", b.api.get(`/api/tenants/${tenantId}/groups`)],
    ["GET tenant export", b.api.get(`/api/tenants/${tenantId}/export`)],
    ["POST consent link", b.api.post(`/api/tenants/${tenantId}/consent-link`, { data: { email: "x@evil.test" } })],
    ["POST rings", b.api.post("/api/rings", { data: { tenantId, pilot: { id: "g1" }, broad: { id: "g2" } } })],
    ["POST tenant-apps", b.api.post("/api/tenant-apps", { data: { tenantId, appSlug: "7zip", autoUpdate: false } })],
    ["POST deployments", b.api.post("/api/deployments", { data: { tenantId, versionId: "x" } })],
    ["PATCH webhook", b.api.patch(`/api/webhooks/${whId}`, { data: { url: "https://evil.example.com/" } })],
    ["DELETE webhook", b.api.delete(`/api/webhooks/${whId}`)],
    ["POST webhook test", b.api.post(`/api/webhooks/${whId}/test`)],
    ["GET member scope", b.api.get(`/api/members/${a.userId}/scope`)],
    ["PUT member scope", b.api.put(`/api/members/${a.userId}/scope`, { data: { scope: [] } })],
    ["GET full org", b.api.get(`/api/auth/organization/get-full-organization?organizationId=${a.orgId}`)],
    ["set-active", b.api.post("/api/auth/organization/set-active", { data: { organizationId: a.orgId } })],
    ["invite into A", b.api.post("/api/auth/organization/invite-member", { data: { email: "x@evil.test", role: "admin", organizationId: a.orgId } })],
    ["update A", b.api.post("/api/auth/organization/update", { data: { organizationId: a.orgId, data: { name: "pwned" } } })],
    ["delete A", b.api.post("/api/auth/organization/delete", { data: { organizationId: a.orgId } })],
    ["api key for A", b.api.post("/api/auth/api-key/create", { data: { name: "steal", organizationId: a.orgId } })],
    ["list A api keys", b.api.get(`/api/auth/api-key/list?organizationId=${a.orgId}`)],
    ["list A invitations", b.api.get(`/api/auth/organization/list-invitations?organizationId=${a.orgId}`)],
  ];
  for (const [label, p] of tries) {
    const r = await p;
    // Without an Entra app (stub mode) tenant connect answers 503 before any lookup; nothing is read or written.
    const ok = label === "POST consent link" ? [403, 404, 503] : [400, 401, 403, 404, 409];
    expect(ok, `${label}: ${r.status()} ${(await r.text()).slice(0, 160)}`).toContain(r.status());
  }

  // The victim's webhook is untouched and the attacker's lists never contain victim rows.
  const list = await (await a.api.get("/api/webhooks")).json();
  expect(list.endpoints.find((e: { id: string }) => e.id === whId)?.url).toBe("https://hooks.example.com/a");
  const bw = await (await b.api.get("/api/webhooks")).json();
  expect(bw.endpoints).toHaveLength(0);
  const bd = await (await b.api.get(`/api/webhooks/deliveries?endpointId=${whId}`)).json();
  expect(bd.deliveries).toHaveLength(0);
  const audit = await b.api.get("/api/audit?format=csv");
  expect(await audit.text()).not.toContain(a.orgId);
  const full = await (await a.api.get(`/api/auth/organization/get-full-organization?organizationId=${a.orgId}`)).json();
  expect(full.name).toBe("victim MSP");
});

test("privilege escalation: an invited admin cannot make themselves owner or invite an owner", async ({ baseURL, request }) => {
  const owner = await actor(baseURL!, request, "owner");
  const adminEmail = `admin+${Date.now()}@msp.test`;
  const inv = await owner.api.post("/api/auth/organization/invite-member", { data: { email: adminEmail, role: "admin", organizationId: owner.orgId } });
  expect(inv.status(), await inv.text()).toBe(200);
  const invId = (await inv.json()).id as string;

  // A stranger cannot accept an invitation addressed to someone else.
  const stranger = await signIn(baseURL!, `stranger+${Date.now()}@msp.test`, request);
  const steal = await stranger.post("/api/auth/organization/accept-invitation", { data: { invitationId: invId } });
  expect(steal.status()).toBeGreaterThanOrEqual(400);

  const admin = await signIn(baseURL!, adminEmail, request);
  const acc = await admin.post("/api/auth/organization/accept-invitation", { data: { invitationId: invId } });
  expect(acc.status(), await acc.text()).toBe(200);
  const me = (await (await admin.get("/api/auth/get-session")).json()).user.id as string;
  const full = await (await admin.get(`/api/auth/organization/get-full-organization?organizationId=${owner.orgId}`)).json();
  const myMember = full.members.find((m: { userId: string }) => m.userId === me);
  const ownerMember = full.members.find((m: { userId: string }) => m.userId === owner.userId);

  const up = await admin.post("/api/auth/organization/update-member-role", { data: { memberId: myMember.id, role: "owner", organizationId: owner.orgId } });
  expect(up.status(), "admin to owner").toBeGreaterThanOrEqual(400);
  const demote = await admin.post("/api/auth/organization/update-member-role", { data: { memberId: ownerMember.id, role: "viewer", organizationId: owner.orgId } });
  expect(demote.status(), "admin demotes owner").toBeGreaterThanOrEqual(400);
  const kick = await admin.post("/api/auth/organization/remove-member", { data: { memberIdOrEmail: ownerMember.id, organizationId: owner.orgId } });
  expect(kick.status(), "admin removes owner").toBeGreaterThanOrEqual(400);
  const invOwner = await admin.post("/api/auth/organization/invite-member", { data: { email: `x+${Date.now()}@msp.test`, role: "owner", organizationId: owner.orgId } });
  expect(invOwner.status(), "admin invites owner").toBeGreaterThanOrEqual(400);
  // Billing is owner only.
  const co = await admin.post("/api/billing/checkout", { data: { plan: "fleet", interval: "year" } });
  expect([403, 503]).toContain(co.status());
});

test("magic links are single use and die with the session", async ({ baseURL, request }) => {
  const email = `replay+${Date.now()}@msp.test`;
  const api = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL!, "x-forwarded-for": ip() } });
  await api.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" } });
  const link = await magicLink(request, email);
  expect([302, 307]).toContain((await api.get(link, { maxRedirects: 0 })).status());
  const cookie = (await api.storageState()).cookies.find((c) => c.name.endsWith("session_token"));
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  // Replay in a fresh client.
  const thief = await pwRequest.newContext({ baseURL });
  const replay = await thief.get(link, { maxRedirects: 0 });
  expect(replay.headers()["location"] ?? "").toMatch(/error/i);
  expect((await thief.storageState()).cookies.find((c) => c.name.endsWith("session_token"))).toBeFalsy();
  // After sign-out the stolen cookie is dead.
  await api.post("/api/auth/sign-out", { data: {} });
  const old = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { cookie: `${cookie!.name}=${cookie!.value}` } });
  expect(await (await old.get("/api/auth/get-session")).json()).toBeNull();
});

test("open redirect: control characters in ?next cannot turn into //evil.example", async ({ baseURL, request }) => {
  const api = await signIn(baseURL!, `redir+${Date.now()}@msp.test`, request);
  for (const next of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "//evil.example", "/\\evil.example", "https://evil.example"]) {
    const r = await api.get(`/sign-in?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
    const loc = r.headers()["location"] ?? "";
    const target = new URL(loc.replace(/[\t\n\r]/g, ""), baseURL);
    expect(target.host, `${JSON.stringify(next)} -> ${loc}`).toBe(new URL(baseURL!).host);
  }
});

test("magic link mail bombing: one address is capped no matter how many IPs ask", async ({ baseURL }) => {
  const email = `bomb+${Date.now()}@msp.test`;
  const codes: number[] = [];
  for (let i = 0; i < 8; i++) {
    const api = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL!, "x-forwarded-for": ip() } });
    codes.push((await api.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" } })).status());
  }
  expect(codes.filter((c) => c === 429).length, codes.join(",")).toBeGreaterThan(0);
});

test("SSRF: webhook URLs that reach loopback through a hostname are refused", async ({ baseURL, request }) => {
  const a = await actor(baseURL!, request, "ssrf");
  for (const u of ["https://localhost./h", "https://LOCALHOST.:3100/h", "https://0.0.0.0/h", "https://100.100.100.200/h", "https://metadata.google.internal./x", "https://2130706433/h", "https://0x7f.1/h"]) {
    const r = await a.api.post("/api/webhooks", { data: { url: u, events: ["*"] } });
    expect(r.status(), u).toBe(400);
  }
});

test("data export: a viewer gets only what a viewer may see (no audit log, no billing account)", async ({ baseURL, request }) => {
  const owner = await actor(baseURL!, request, "exportowner");
  await owner.api.post("/api/webhooks", { data: { url: "https://hooks.example.com/x", events: ["*"] } }); // writes an audit row with the owner's IP
  const viewerEmail = `viewer+${Date.now()}@msp.test`;
  const inv = await owner.api.post("/api/auth/organization/invite-member", { data: { email: viewerEmail, role: "viewer", organizationId: owner.orgId } });
  const viewer = await signIn(baseURL!, viewerEmail, request);
  expect((await viewer.post("/api/auth/organization/accept-invitation", { data: { invitationId: (await inv.json()).id } })).status()).toBe(200);
  const exp = await (await viewer.get("/api/account/export")).json();
  const org = exp.organizations.find((o: { id: string }) => o.id === owner.orgId);
  expect(org).toBeTruthy();
  expect(org.data.auditLog, "viewer has no audit:read").toBeUndefined();
  expect(org.data.billingAccount).toBeUndefined();
  expect(org.data.webhookEndpoints).toBeUndefined();
  // The owner still gets everything.
  const mine = (await (await owner.api.get("/api/account/export")).json()).organizations.find((o: { id: string }) => o.id === owner.orgId);
  expect(mine.data.auditLog.length).toBeGreaterThan(0);
});

test("magic link callbackURL cannot point off site", async ({ baseURL }) => {
  const api = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL!, "x-forwarded-for": ip() } });
  for (const cb of ["https://evil.example/x", "//evil.example", "/\t/evil.example"]) {
    const r = await api.post("/api/auth/sign-in/magic-link", { data: { email: `cb+${Date.now()}@msp.test`, callbackURL: cb } });
    expect(r.status(), JSON.stringify(cb)).toBe(403);
  }
});

test("API keys: an admin can manage the organisation's keys, an operator cannot create one", async ({ baseURL, request }) => {
  const owner = await actor(baseURL!, request, "keyowner");
  const join = async (role: string) => {
    const email = `${role}+${Date.now()}@msp.test`;
    const inv = await owner.api.post("/api/auth/organization/invite-member", { data: { email, role, organizationId: owner.orgId } });
    const api = await signIn(baseURL!, email, request);
    expect((await api.post("/api/auth/organization/accept-invitation", { data: { invitationId: (await inv.json()).id } })).status()).toBe(200);
    return api;
  };
  const admin = await join("admin");
  const created = await admin.post("/api/auth/api-key/create", { data: { name: "ci", organizationId: owner.orgId } });
  expect(created.status(), await created.text()).toBe(200);
  const keyId = (await created.json()).id as string;
  const operator = await join("operator");
  expect((await operator.post("/api/auth/api-key/create", { data: { name: "x", organizationId: owner.orgId } })).status()).toBe(403);
  expect((await operator.post("/api/auth/api-key/delete", { data: { keyId } })).status()).toBe(403);
  expect((await admin.post("/api/auth/api-key/delete", { data: { keyId } })).status()).toBe(200);
});
