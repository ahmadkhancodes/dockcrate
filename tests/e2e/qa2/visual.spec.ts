import { expect, test, type Page } from "@playwright/test";
import { signInViaUi, watch } from "../qa/helpers";

const PUBLIC = ["/", "/pricing", "/security", "/catalog", "/catalog/7-zip", "/compare/pckgr", "/docs", "/docs/connect-a-tenant", "/early-access", "/sign-in", "/legal/privacy", "/legal/terms", "/legal/dpa", "/does-not-exist", "/accept-invite?invitation=nope"];
const APP = ["/app", "/app/tenants", "/app/msp", "/app/billing", "/app/app-sets", "/app/settings/members", "/app/settings/webhooks", "/app/settings/security", "/app/settings/api-keys", "/app/settings/notifications", "/app/settings/profile", "/app/settings/audit"];
const FONT_OK = /^(Saira Stencil|IBM Plex (Sans|Mono))|^__(Saira|IBM)/i;

async function inspect(page: Page) {
  return page.evaluate((fontOk) => {
    const out: string[] = [];
    const ok = new RegExp(fontOk, "i");
    const seen = new Set<string>();
    for (const el of document.body.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      if (s.display === "none") continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (hasText) {
        const first = s.fontFamily.split(",")[0].replace(/["']/g, "").trim();
        if (!ok.test(first) && !seen.has(first)) { seen.add(first); out.push(`font "${first}" on <${el.tagName.toLowerCase()}> ${el.textContent?.trim().slice(0, 30)}`); }
      }
      // text cut off: a clipping box that is narrower than its content
      if ((s.overflowX === "hidden" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== "ellipsis" && el.clientWidth > 0) {
        if (!el.closest("[aria-hidden=true], svg, .sr-only") && hasText) out.push(`clipped <${el.tagName.toLowerCase()}> ${el.textContent?.trim().slice(0, 40)}`);
      }
    }
    return out;
  }, FONT_OK.source);
}

for (const vp of [{ w: 375, h: 812 }, { w: 1440, h: 900 }]) {
  test(`qa2 visual ${vp.w}: fonts, clipping, light scheme even when the OS asks for dark`, async ({ browser, request }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: "dark" });
    const page = await ctx.newPage();
    const problems = watch(page);
    const found: string[] = [];
    for (const p of PUBLIC) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      for (const a of await inspect(page)) found.push(`${p} ${a}`);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const lum = bg.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
      if (lum < 150) found.push(`${p} dark body background ${bg}`);
    }
    await signInViaUi(page, request);
    for (const p of APP) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      for (const a of await inspect(page)) found.push(`${p} ${a}`);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      if (bg.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3 < 150) found.push(`${p} dark body background ${bg}`);
    }
    console.log(JSON.stringify({ vp, found: [...new Set(found)] }, null, 1));
    expect([...new Set(found)]).toEqual([]);
    expect(problems.filter((x) => !x.includes("#418") && !/\/(does-not-exist|accept-invite)/.test(x)).filter((x) => !x.startsWith("http 404") )).toEqual([]);
    await ctx.close();
  });
}

test("qa2 keyboard: every Tab stop on every page shows a visible focus indicator", async ({ page, request }) => {
  test.setTimeout(240_000);
  const bad: string[] = [];
  const walk = async (p: string) => {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const ringed = (e: Element) => { const c = getComputedStyle(e); return (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== "none"; };
        // a wrapper with focus-within:focus-ring counts (composite inputs)
        const visible = ringed(el) || (el.parentElement ? ringed(el.parentElement) : false);
        const rect = el.getBoundingClientRect();
        return { visible, label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30), offscreen: rect.width === 0 };
      });
      if (r && !r.visible && !r.offscreen) bad.push(`${p} focus invisible on "${r.label}"`);
    }
  };
  for (const p of ["/", "/pricing", "/sign-in", "/early-access", "/catalog", "/docs"]) await walk(p);
  await signInViaUi(page, request);
  for (const p of ["/app", "/app/tenants", "/app/billing", "/app/settings/api-keys", "/app/settings/members"]) await walk(p);
  expect([...new Set(bad)]).toEqual([]);
});
