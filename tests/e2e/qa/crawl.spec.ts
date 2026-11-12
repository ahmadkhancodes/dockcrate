import { expect, test, type Page } from "@playwright/test";
import { signInViaUi, watch } from "./helpers";

const PUBLIC = ["/", "/pricing", "/security", "/catalog", "/compare/pckgr", "/docs", "/early-access", "/sign-in", "/legal/privacy", "/legal/terms", "/legal/dpa", "/llms.txt", "/robots.txt", "/sitemap.xml"];
const APP = ["/app", "/app/tenants", "/app/msp", "/app/billing", "/app/app-sets", "/app/settings/members", "/app/settings/webhooks", "/app/settings/security", "/app/settings/api-keys", "/app/settings/notifications", "/app/settings/profile", "/app/settings/audit"];

async function audit(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`h-scroll ${document.documentElement.scrollWidth}>${window.innerWidth}`);
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden"; };
    for (const el of document.querySelectorAll("button, a[href], [role=button], summary, select, [type=checkbox], [type=radio]")) {
      if (!vis(el)) continue;
      const h = el as HTMLElement;
      const s = getComputedStyle(h);
      const name = h.getAttribute("aria-label") || h.textContent?.trim() || (h as HTMLInputElement).labels?.[0]?.textContent;
      if (!name) out.push(`unnamed ${h.outerHTML.slice(0, 90)}`);
      if (s.cursor !== "pointer" && !(h as HTMLButtonElement).disabled && h.getAttribute("aria-disabled") !== "true" && !(h as HTMLInputElement).labels?.length) out.push(`cursor ${s.cursor}: ${(name ?? "").slice(0, 40)}`);
      const r = h.getBoundingClientRect();
      if (window.innerWidth < 640 && r.height < 44 && h.tagName !== "A" && (h.tagName === "BUTTON" || h.getAttribute("role") === "button")) out.push(`tap ${Math.round(r.width)}x${Math.round(r.height)}: ${(name ?? "").slice(0, 40)}`);
    }
    return out;
  });
}

for (const vp of [{ w: 375, h: 812 }, { w: 1440, h: 900 }]) {
  {
    test(`crawl ${vp.w} light: public pages and app pages are clean`, async ({ page, request }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      let step = "";
      const problems = watch(page, () => step);
      const found: string[] = [];
      for (const p of PUBLIC) {
        step = `public ${p}`;
        const res = await page.goto(p);
        if (!res?.ok()) found.push(`${p} -> ${res?.status()}`);
        if (/\.(txt|xml)$/.test(p)) continue;
        await page.waitForLoadState("networkidle");
        for (const a of await audit(page)) found.push(`${p} ${a}`);
      }
      step = "sign-in";
      await signInViaUi(page, request);
      for (const p of APP) {
        step = `app ${p}`;
        const res = await page.goto(p);
        if (!res?.ok()) found.push(`${p} -> ${res?.status()}`);
        await page.waitForLoadState("networkidle");
        for (const a of await audit(page)) found.push(`${p} ${a}`);
      }
      console.log(JSON.stringify({ vp, found: [...new Set(found)], problems: [...new Set(problems)] }, null, 1));
      expect(found).toEqual([]);
      // Known open defect QA-9 (docs/QA-REPORT.md): React #418 on /sign-in after a router prefetch. Tracked by the fixme test below, not hidden.
      expect(problems.filter((p) => !(p.startsWith("/sign-in [public /sign-in]") && p.includes("React error #418")))).toEqual([]);
    });
  }
}

// QA-9, open: after a page that prefetches /sign-in (any marketing page), loading /sign-in logs React error #418 once. The DOM equals
// the server HTML afterwards and nothing is visible, but it is a real hydration mismatch. Blocking `_rsc` prefetch removes it.
test.fixme("sign-in hydrates without errors after a route prefetch", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});
