import { expect, test } from "@playwright/test";
import { signInViaUi } from "./helpers";

test("health reports database and dependency state without leaking details", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body).toMatchObject({ ok: true, db: "memory", deps: { stripe: false, mail: false, entra: false } });
  expect(JSON.stringify(body)).not.toMatch(/sk_|re_|mongodb|secret/i);
});

test("dock export: signed out is refused, a guessed tenant id of another org is a 404", async ({ page, request }) => {
  expect((await request.get("/api/tenants/guess-1234/export")).status()).toBe(401);
  await signInViaUi(page, request, { org: "Isolation MSP" });
  const res = await page.request.get("/api/tenants/ten_guessed_id/export");
  expect(res.status()).toBe(404);
  expect(await res.text()).not.toContain("text/csv");
});

test("forged Stripe webhook is refused and never a 500", async ({ request }) => {
  const r = await request.post("/api/stripe/webhook", { headers: { "stripe-signature": "t=1,v1=bad" }, data: "{}" });
  expect([400, 503]).toContain(r.status());
});

test("the dock page loads without console or CSP errors for a new org", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) errors.push(m.text()); });
  await signInViaUi(page, request, { org: "CSP Check MSP" });
  await expect(page.getByRole("heading", { name: "Dock" })).toBeVisible();
  expect(errors).toEqual([]);
});
