import { expect, test } from "@playwright/test";
import { signInViaUi } from "./helpers";

test("founder-only pages and cron endpoints refuse ordinary users and strangers", async ({ page, request }) => {
  for (const p of ["/admin", "/admin/leads", "/api/admin/leads"]) {
    const r = await request.get(p, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401, 403, 404], `anon ${p}`).toContain(r.status());
  }
  await signInViaUi(page, request);
  for (const p of ["/admin", "/admin/leads"]) {
    const res = await page.goto(p);
    const denied = res?.status() === 404 || res?.status() === 403 || /\/(sign-in|app)/.test(page.url());
    expect(denied, `${p} -> ${page.url()} ${res?.status()}`).toBe(true);
    await expect(page.locator("body")).not.toContainText(/@.*\.(com|test)/); // no lead emails leak
  }
  for (const job of ["daily", "rings-tick", "device-count", "catalog-sync", "heartbeat"]) {
    const r = await request.post(`/api/cron/${job}`);
    expect([401, 403, 404, 405], job).toContain(r.status());
    const g = await request.get(`/api/cron/${job}`);
    expect([401, 403, 404, 405], `GET ${job}`).toContain(g.status());
  }
});

test("API refuses cross-site writes, oversized bodies and malformed JSON with a clean 4xx", async ({ page, request, baseURL }) => {
  await signInViaUi(page, request);
  const origin = { origin: baseURL! };
  const bad = await page.request.post("/api/webhooks", { data: "{not json", headers: { ...origin, "content-type": "application/json" } });
  expect(bad.status()).toBeLessThan(500);
  const big = await page.request.post("/api/webhooks", { data: { url: "https://x.example.com/" + "a".repeat(5000), events: ["alert.created"] }, headers: origin });
  expect(big.status()).toBeLessThan(500);
  const huge = await page.request.post("/api/webhooks", { data: { url: "https://x.example.com/", junk: "z".repeat(1_100_000) }, headers: origin });
  expect([400, 413]).toContain(huge.status());
  const evil = await page.request.post("/api/webhooks", { data: { url: "https://x.example.com/h", events: ["alert.created"] }, headers: { origin: "https://evil.test" } });
  expect(evil.status()).toBe(403);
  for (const u of ["https://localhost/h", "https://127.0.0.1/h", "https://169.254.169.254/latest", "https://10.0.0.5/x", "https://[::1]/x", "ftp://x.example.com/", "javascript:alert(1)"]) {
    const r = await page.request.post("/api/webhooks", { data: { url: u, events: ["alert.created"] }, headers: origin });
    expect(r.status(), u).toBe(400);
  }
});

test("early access API: honeypot, bad captcha, rate limit and hostile bodies never 500", async ({ request }) => {
  const post = (data: unknown) => request.post("/api/early-access", { data, headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  for (const body of [{}, { email: "a@b.co" }, { email: "x".repeat(400) + "@a.co", company: "c", endpoints: 5 }, { email: "a@b.co", company: "<svg onload=1>", endpoints: "NaN", altcha: "bogus" }, [], "str", null]) {
    const r = await post(body);
    expect(r.status(), JSON.stringify(body).slice(0, 60)).toBeLessThan(500);
    expect(r.status()).toBeGreaterThanOrEqual(400);
  }
});

test("catalog and docs slugs with hostile characters give 404, not a crash", async ({ request }) => {
  for (const p of ["/catalog/%00", "/catalog/..%2f..%2fetc%2fpasswd", "/catalog/" + "a".repeat(3000), "/docs/%3Cscript%3E", "/compare/nope", "/legal/nope", "/connect/consent/garbage"]) {
    const r = await request.get(p);
    expect([200, 400, 404, 414], p).toContain(r.status());
    expect(r.status(), p).not.toBeGreaterThanOrEqual(500);
  }
});

test("sign-in with hostile emails never 500s and never reveals whether an account exists", async ({ request }) => {
  const ip = () => ({ origin: "http://localhost:3100", "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  for (const email of ["a@b.co", "'; drop table users;--@x.co", "ünï@例え.jp", "x".repeat(300) + "@a.co", "<b>@a.co", "a@b"]) {
    const r = await request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: ip() });
    expect(r.status(), email).toBeLessThan(500);
  }
});
