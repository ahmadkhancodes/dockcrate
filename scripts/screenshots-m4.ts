/**
 * Playwright screenshots of the M4 pages at 375 and 1440, light: security, catalog, catalog app page, docs FAQ,
 * notifications, members, audit log (with Verify chain) and the alert centre. Stub mode: memory DB, fake Graph.
 *   BASE_URL=http://localhost:3100 CHROME_PATH=/usr/bin/google-chrome npx tsx scripts/screenshots-m4.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.OUT_DIR ?? "docs/qa/m4";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const origin = { origin: BASE };
  const email = `shots+${Date.now()}@msp.test`;
  await page.request.post(`${BASE}/api/auth/sign-in/magic-link`, { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await page.request.get(`${BASE}/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await (await page.request.post(`${BASE}/api/auth/organization/create`, { data: { name: "Northbay IT", slug: `northbay-${Date.now()}` }, headers: origin })).json();
  await page.request.post(`${BASE}/api/auth/organization/set-active`, { data: { organizationId: org.id }, headers: origin });
  const created = await (await page.request.post(`${BASE}/api/tenants`, { data: { name: "Halvorsen Dental" }, headers: origin })).json();
  const state = new URL(created.consentUrl).searchParams.get("state")!;
  await page.request.get(`${BASE}/api/tenants/consent/callback?${new URLSearchParams({ state, tenant: "5b0f3c1e-2a47-4d1e-9a60-1c5d8f2b7e90", admin_consent: "True" })}`, { maxRedirects: 0 });

  const problems: string[] = [];
  const shoot = async (name: string, path: string, width: number, theme: string, act?: () => Promise<void>) => {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    if (act) await act();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${path} @${width} ${theme}: horizontal overflow ${overflow}px`);
    await page.screenshot({ path: `${OUT}/${name}-${width}-${theme}.png`, fullPage: true });
  };
  for (const theme of ["light"] as const) {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.emulateMedia({ colorScheme: "light" });
      for (const [name, path] of [["security", "/security"], ["catalog", "/catalog"], ["catalog-app", "/catalog/7-zip"], ["docs-faq", "/docs/faq"], ["notifications", "/app/settings/notifications"], ["members", "/app/settings/members"]] as const) await shoot(name, path, width, theme);
      await shoot("audit-verify", "/app/settings/audit", width, theme, async () => { await page.getByRole("button", { name: "Verify chain" }).click(); await page.getByText("Chain intact").waitFor(); });
      await shoot("alert-centre", "/app", width, theme, async () => { await page.getByRole("button", { name: /^Alerts/ }).first().click({ trial: false }).catch(() => {}); });
    }
  }
  await browser.close();
  console.log(`screenshots in ${OUT}`);
  if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
}
main().catch((e) => { console.error(e); process.exit(1); });
