/**
 * Playwright screenshots of the M3 dashboard pages (ring setup, App Sets, MSP dashboard, audit log) at 375 and 1440,
 * light and dark. Stub mode: memory DB, fake Graph. No network, no real tenant.
 *   BASE_URL=http://localhost:3100 CHROME_PATH=/usr/bin/google-chrome npx tsx scripts/screenshots-m3.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.OUT_DIR ?? "docs/qa/m3-app";

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

  // Free plan allows one tenant: the MSP, App Sets and ring pages show their real limits and states.
  const created = await (await page.request.post(`${BASE}/api/tenants`, { data: { name: "Halvorsen Dental" }, headers: origin })).json();
  const id: string = created.tenant.id;
  const state = new URL(created.consentUrl).searchParams.get("state")!;
  await page.request.get(`${BASE}/api/tenants/consent/callback?${new URLSearchParams({ state, tenant: "5b0f3c1e-2a47-4d1e-9a60-1c5d8f2b7e90", admin_consent: "True" })}`, { maxRedirects: 0 });
  const second = await page.request.post(`${BASE}/api/tenants`, { data: { name: "Bluebird Logistics" }, headers: origin });
  console.log("second tenant on Free:", second.status(), "(402 expected)");

  const problems: string[] = [];
  const shoot = async (name: string, path: string, width: number, theme: string) => {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${path} @${width} ${theme}: horizontal overflow ${overflow}px`);
    await page.screenshot({ path: `${OUT}/${name}-${width}-${theme}.png`, fullPage: true });
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await shoot("dock-no-rings", `/app?tenant=${id}&app=7-zip`, 1440, "light");
  await shoot("rings-empty", `/app/rings/${id}`, 1440, "light");
  const save = await page.request.post(`${BASE}/api/rings`, { data: { tenantId: id, pilot: { id: "g-pilot" }, broad: { id: "g-broad" }, broadDelayHours: 24 }, headers: origin });
  if (!save.ok()) throw new Error(`rings save failed: ${save.status()}`);
  await page.request.post(`${BASE}/api/deployments`, { data: { tenantId: id, versionId: "7-zip@25.01" }, headers: origin });

  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
      for (const [name, path] of [["rings", `/app/rings/${id}`], ["app-sets", "/app/app-sets"], ["msp", "/app/msp"], ["msp-filtered", "/app/msp?kind=paused&q=zzz"], ["audit", "/app/settings/audit"]] as const) await shoot(name, path, width, theme);
    }
  }
  await browser.close();
  console.log(`screenshots in ${OUT}`);
  if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
}
main().catch((e) => { console.error(e); process.exit(1); });
