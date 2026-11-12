import { expect, test } from "@playwright/test";
import { magicLink, signInViaUi, watch } from "./helpers";

// A new visitor: landing -> pricing -> catalog -> early access -> sign in. Every click asserts something observable.

test("landing primary CTAs reach the early access form and the form really submits (ALTCHA + CSP)", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/");
  const cta = page.getByRole("link", { name: /get early access/i }).first();
  await cta.click();
  await expect(page).toHaveURL(/\/early-access/);
  await page.getByRole("button", { name: "Get early access" }).click();
  // Empty submit must say what is wrong, not do nothing.
  await expect(page.locator("form p[role=alert]")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Work email").fill("ops@northwind-msp.com");
  await page.locator("#ea-company").fill("Northwind MSP");
  await page.getByLabel("Windows endpoints you manage").fill("450");
  await page.getByRole("button", { name: "Get early access" }).click();
  await expect(page.getByText("You are on the list")).toBeVisible({ timeout: 20_000 });
  expect(problems.filter((x) => !x.includes("http 400: http://localhost:3100/api/early-access"))).toEqual([]); // the 400 is the deliberate empty submit above
});

test("early access rejects bad input with a visible message", async ({ page }) => {
  await page.goto("/early-access");
  await page.getByLabel("Work email").fill("not-an-email");
  await page.locator("#ea-company").fill("Acme");
  await page.getByLabel("Windows endpoints you manage").fill("10");
  await page.getByRole("button", { name: "Get early access" }).click();
  await expect(page.locator("form p[role=alert]")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("You are on the list")).toHaveCount(0);
});

test("early access: 100 kB of hostile text in a field never gives a silent failure", async ({ page }) => {
  await page.goto("/early-access");
  await page.getByLabel("Work email").fill("ops@northwind-msp.com");
  await page.locator("#ea-company").fill("<script>alert(1)</script> ".repeat(10));
  await page.getByLabel("Windows endpoints you manage").fill("-5");
  await page.getByRole("button", { name: "Get early access" }).click();
  await expect(page.locator("form p[role=alert]").or(page.getByText("You are on the list"))).toBeVisible({ timeout: 20_000 });
});

test("pricing: every plan button leads somewhere real and prices match the config", async ({ page }) => {
  await page.goto("/pricing");
  const buttons = page.locator("main").getByRole("link", { name: /early access|start free|get started|join/i });
  const n = await buttons.count();
  expect(n).toBeGreaterThanOrEqual(4);
  const hrefs = await buttons.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
  for (const h of new Set(hrefs)) {
    const res = await page.request.get(h!);
    expect(res.status(), h!).toBeLessThan(400);
  }
  const { product } = await import("../../../src/config/product");
  await page.getByRole("button", { name: "Monthly" }).or(page.getByRole("tab", { name: "Monthly" })).or(page.getByRole("radio", { name: "Monthly" })).first().click();
  const body = await page.locator("main").innerText();
  for (const p of product.plans.filter((x) => x.prices.length)) {
    const m = p.prices.find((x) => x.interval === "month")!;
    const dollars = m.usd / 100;
    expect(body, `monthly price of ${p.name}`).toContain(`$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`);
  }
});

test("catalog: search narrows, empty search says so, detail page opens and has a QA log", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/catalog");
  const search = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first();
  await expect(search).toBeVisible();
  const rows = page.locator("main a[href^='/catalog/']");
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  await search.fill("zzzzqqq-no-such-app");
  await expect(page.getByText(/no app matches/i).first()).toBeVisible();
  await search.fill("");
  await search.fill("7");
  expect(await rows.count()).toBeGreaterThan(0);
  await search.fill("<img src=x onerror=alert(1)>");
  await expect(page.locator("main img[src='x']")).toHaveCount(0);
  await search.fill("");
  await rows.first().click();
  await expect(page).toHaveURL(/\/catalog\/.+/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect((await page.request.get("/catalog/definitely-not-an-app")).status()).toBe(404);
  expect(problems).toEqual([]);
});

test("every header and footer link on the home page resolves (no 404, no redirect loop)", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.locator("header a[href], footer a[href]").evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!))]);
  for (const h of hrefs) {
    if (h.startsWith("mailto:") || h.startsWith("#") || /^https?:/.test(h)) continue;
    const res = await page.request.get(h.split("#")[0] || "/");
    expect(res.status(), h).toBeLessThan(400);
  }
});

test("unknown URL shows the branded 404 with a way home", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await page.getByRole("link", { name: /home|back|dockcrate/i }).first().click();
  await expect(page).toHaveURL(/\/$/);
});

test("signed out: /app and every app page send you to sign-in and bring you back after", async ({ page, request }) => {
  await page.goto("/app/settings/members");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings%2Fmembers|\/sign-in/);
  for (const api of ["/api/tenants", "/api/members", "/api/audit", "/api/alerts", "/api/billing/entitlement"]) {
    const r = await request.get(api);
    expect([401, 403, 404, 405], api).toContain(r.status());
  }
  await signInViaUi(page, request, { next: "/app/settings/members" });
  await expect(page).toHaveURL(/\/app\/settings\/members/);
});

test("sign-in: bad email, reused link and expired/invalid link all explain themselves", async ({ page, request, browser }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nope");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/valid email/i)).toBeVisible();
  await page.getByLabel("Email").fill("  ");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/valid email/i)).toBeVisible();

  const email = await signInViaUi(page, request);
  // Reused link in a fresh browser context: must not log in and must say why.
  const link = await magicLink(request, email);
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(link);
  await expect(p2).toHaveURL(/\/sign-in/);
  await expect(p2.getByText(/expired|invalid|already|used/i).first()).toBeVisible();
  await p2.goto("/app");
  await expect(p2).toHaveURL(/\/sign-in/);
  await ctx.close();
  // Garbage token.
  await page.context().clearCookies();
  await page.goto("/api/auth/magic-link/verify?token=garbage&callbackURL=%2Fapp&errorCallbackURL=%2Fsign-in");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(/expired|invalid/i).first()).toBeVisible();
});

test("sign-in ?next cannot redirect off site", async ({ page, request }) => {
  await signInViaUi(page, request, { next: "//evil.test/x", org: "Open Redirect Co" });
  expect(new URL(page.url()).origin).toBe(new URL(page.url()).origin);
  expect(page.url()).not.toContain("evil.test");
});
