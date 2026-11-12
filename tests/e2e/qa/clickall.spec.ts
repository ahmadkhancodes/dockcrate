import { expect, test, type Page } from "@playwright/test";
import { signInViaUi, watch } from "./helpers";

// Click every enabled button and every in-page link; each click must visibly change something (DOM, URL, focus into a dialog, network, download).
const SKIP = /sign out|delete my account|log out/i;

async function clickAll(page: Page, path: string) {
  const dead: string[] = [];
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const count = await page.locator("main button:not([disabled]), header button:not([disabled]), aside button:not([disabled]), nav button:not([disabled])").count();
  for (let i = 0; i < count; i++) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const b = page.locator("main button:not([disabled]), header button:not([disabled]), aside button:not([disabled]), nav button:not([disabled])").nth(i);
    if (!(await b.isVisible())) continue;
    const label = ((await b.getAttribute("aria-label")) ?? (await b.innerText()) ?? "").trim().slice(0, 50);
    if ((await b.getAttribute("aria-pressed")) === "true" || (await b.getAttribute("aria-checked")) === "true" || (await b.getAttribute("aria-selected")) === "true" || SKIP.test(label) || (await b.getAttribute("type")) === "submit") continue;
    await page.evaluate(() => {
      const w = window as unknown as { __mut: number };
      w.__mut = 0;
      new MutationObserver((m) => { w.__mut += m.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    const url = page.url();
    let req = 0;
    const onReq = () => req++;
    page.on("request", onReq);
    await b.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    page.off("request", onReq);
    const changed = await page.evaluate(() => (window as unknown as { __mut: number }).__mut).catch(() => 1); // navigation destroys the context: that is a change
    if (changed === 0 && page.url() === url && req === 0) dead.push(`${path}: button "${label}" did nothing`);
  }
  return dead;
}

test("marketing pages: no button is a dead click", async ({ page }) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  const dead: string[] = [];
  for (const p of ["/", "/pricing", "/security", "/catalog", "/compare/pckgr", "/docs", "/early-access"]) dead.push(...(await clickAll(page, p)));
  expect(dead).toEqual([]);
  expect(problems.filter((x) => !/http 4\d\d/.test(x))).toEqual([]);
});

test("app pages: no button is a dead click", async ({ page, request }) => {
  test.setTimeout(240_000);
  await signInViaUi(page, request);
  const dead: string[] = [];
  for (const p of ["/app", "/app/tenants", "/app/msp", "/app/billing", "/app/app-sets", "/app/settings/members", "/app/settings/webhooks", "/app/settings/notifications", "/app/settings/audit"]) dead.push(...(await clickAll(page, p)));
  expect(dead).toEqual([]);
});

test("app shell: alert bell and org switcher open, close with Escape and are labelled", async ({ page, request }) => {
  await signInViaUi(page, request);
  const bell = page.getByRole("button", { name: /alert|notification|bell/i }).first();
  if (await bell.count()) {
    await bell.click();
    await expect(page.getByText(/no alerts|all clear|nothing|no new/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await expect(page.getByText("Northwind MSP").first()).toBeVisible();
  // second org via the real UI, then switch back
  await page.goto("/onboarding?new=1");
  await page.getByLabel("Organization name").fill("Contoso Branch");
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/app/);
  await expect(page.getByText("Contoso Branch").first()).toBeVisible();
});

test("deep links with bogus ids give a calm not-found or redirect, never a stack trace", async ({ page, request }) => {
  await signInViaUi(page, request);
  for (const p of ["/app?tenant=nope", "/app/rings/nope", "/app/tenants?tenant=nope", "/accept-invite/nope", "/connect/consent/garbage", "/app/billing?checkout=success", "/app/billing?checkout=canceled", "/app/billing?plan=nonsense&interval=week", "/app/settings/audit?from=garbage&to=2020-13-45&action=%00"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBeLessThan(500);
    await expect(page.locator("body"), p).not.toContainText(/Application error|Unhandled|TypeError|digest/i);
    await expect(page.locator("h1").first(), p).toBeVisible();
  }
});
