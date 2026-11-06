import { expect, test, type Page } from "@playwright/test";

// Keyboard flow and visible focus on the dock, tenants, rings (redirects without a tenant) and App Sets pages. Stub mode, memory driver.
async function signIn(page: Page, request: import("@playwright/test").APIRequestContext, baseURL: string) {
  const email = `a11y+${Date.now()}@studio.test`;
  const origin = { origin: baseURL };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Access", slug: `harbor-a-${Date.now()}` }, headers: origin });
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });
}

const focusedOutline = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return null;
  const s = getComputedStyle(el);
  return { tag: el.tagName, width: parseFloat(s.outlineWidth), style: s.outlineStyle, name: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) };
});

for (const [name, path] of [["dock", "/app"], ["tenants", "/app/tenants"], ["App Sets", "/app/app-sets"]] as const) {
  test(`${name}: skip link first, every tab stop shows a focus outline, one h1, no unnamed controls`, async ({ page, request, baseURL }) => {
    await signIn(page, request, baseURL!);
    await page.goto(path);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Skip to content");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("main");
    await page.goto(path);
    expect(await page.locator("h1").count()).toBe(1);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll("button, a[href], input, select, textarea")].filter((e) => {
      const el = e as HTMLElement;
      if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false; // hidden
      return !(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.textContent?.trim() || (el as HTMLInputElement).labels?.length);
    }).map((e) => e.outerHTML.slice(0, 80)));
    expect(unnamed).toEqual([]);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const f = await focusedOutline(page);
      if (!f) break;
      expect(f.style, `${f.tag} ${f.name}`).not.toBe("none");
      expect(f.width, `${f.tag} ${f.name}`).toBeGreaterThanOrEqual(2);
    }
  });
}

test("reduced motion turns transitions off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const d = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
  expect(parseFloat(d)).toBeLessThan(0.001);
  const a = await page.evaluate(() => getComputedStyle(document.querySelector("a")!).transitionDuration);
  expect(parseFloat(a)).toBeLessThan(0.001);
});
