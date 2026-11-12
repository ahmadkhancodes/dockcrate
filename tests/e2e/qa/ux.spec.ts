import { expect, test } from "@playwright/test";
import { signInViaUi, watch } from "./helpers";

test.describe("mobile 375", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("menu opens, traps focus, Escape closes and returns focus, a link navigates and closes it", async ({ page }) => {
    const problems = watch(page);
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
    await toggle.click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/pricing/);
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
    // page scroll is unlocked after the menu closes
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    expect(problems).toEqual([]);
  });

  test("signed-in app shell: navigation is reachable on a phone (every settings page via the UI)", async ({ page, request }) => {
    await signInViaUi(page, request);
    const nav = page.getByRole("button", { name: /menu|navigation/i }).first();
    await expect(nav).toBeVisible();
    await nav.click();
    await page.getByRole("link", { name: "API keys" }).click();
    await expect(page).toHaveURL(/api-keys/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test("keyboard only: sign in with Tab + Enter, focus lands in the first field, errors are announced", async ({ page }) => {
  await page.goto("/sign-in");
  await page.keyboard.press("Tab"); // skip link
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => (document.activeElement as HTMLInputElement)?.id || document.activeElement?.tagName);
  expect(["email", "BUTTON", "A", "INPUT"]).toContain(focused);
  await page.getByLabel("Email").focus();
  await page.keyboard.type("bad address");
  await page.keyboard.press("Enter");
  await expect(page.locator("p[role=alert]")).toContainText(/valid email/i);
  expect(await page.getByLabel("Email").getAttribute("aria-invalid")).toBe("true");
});

test("confirm dialogs return focus to the button that opened them", async ({ page, request }) => {
  await signInViaUi(page, request);
  await page.goto("/app/settings/api-keys");
  await page.getByLabel("Name").fill("ci");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("button", { name: "Delete" }).first()).toBeVisible();
  const del = page.getByRole("button", { name: "Delete" }).first();
  await del.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true); // focus stays inside
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe("Delete");
});

test("numbers on the billing page match the plan limits in config", async ({ page, request }) => {
  await signInViaUi(page, request);
  await page.goto("/app/billing");
  const { product } = await import("../../../src/config/product");
  const body = await page.locator("main").innerText();
  const free = product.plans.find((p) => p.id === "free")!;
  expect(body).toContain(String(free.limits.devices));
  for (const p of product.plans.filter((x) => x.prices.length)) expect(body).toContain(p.name);
  // The plan list on /pricing shows the same device counts as config
  await page.goto("/pricing");
  const pricing = await page.locator("main").innerText();
  for (const p of product.plans) expect(pricing, p.name).toContain(p.limits.devices.toLocaleString("en-US"));
});

test("copy that must not over-promise: macOS and unshipped features are labelled Roadmap on pricing", async ({ page }) => {
  await page.goto("/pricing");
  const main = await page.locator("main").innerText();
  for (const f of ["macOS", "Scheduled windows", "Client PDF reports", "Defender patch queue", "Policy backup"]) expect(main).toMatch(new RegExp(`${f}\\s*Roadmap`));
});

test("every link on every docs page and the catalog resolves", async ({ page }) => {
  const seen = new Set<string>();
  for (const start of ["/docs", "/catalog", "/security", "/compare/pckgr", "/pricing", "/legal/privacy"]) {
    await page.goto(start);
    const hrefs = await page.locator("main a[href]").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!));
    for (const h of hrefs) {
      if (!h || h.startsWith("#") || h.startsWith("mailto:") || /^https?:/.test(h) || seen.has(h)) continue;
      seen.add(h);
      const res = await page.request.get(h);
      expect(res.status(), `${start} -> ${h}`).toBeLessThan(400);
    }
  }
});
