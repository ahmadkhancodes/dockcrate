/**
 * Playwright screenshots of the signed-in dashboard pages (/app and /app/tenants) at 375 and 1440, light and dark.
 * Runs against a server in stub mode (memory DB, fake Graph, console mail). No network, no real tenant.
 *   BASE_URL=http://localhost:3100 CHROME_PATH=/usr/bin/google-chrome npx tsx scripts/screenshots-app.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.OUT_DIR ?? "docs/qa/m2-app";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const origin = { origin: BASE };
  const email = `shots+${Date.now()}@msp.test`;

  await page.request.post("/api/auth/sign-in/magic-link".replace(/^/, BASE), { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await page.request.get(`${BASE}/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await (await page.request.post(`${BASE}/api/auth/organization/create`, { data: { name: "Northbay IT", slug: `northbay-${Date.now()}` }, headers: origin })).json();
  await page.request.post(`${BASE}/api/auth/organization/set-active`, { data: { organizationId: org.id }, headers: origin });

  // Empty state first
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/dock-empty-1440-light.png`, fullPage: true });

  // Two tenants: one connected with two published apps, one waiting for an admin
  const ids: string[] = [];
  for (const [i, name] of ["Halvorsen Dental", "Bluebird Logistics"].entries()) {
    const r = await (await page.request.post(`${BASE}/api/tenants`, { data: { name }, headers: origin })).json();
    ids.push(r.tenant.id);
    if (i === 0) {
      const state = new URL(r.consentUrl).searchParams.get("state")!;
      await page.request.get(`${BASE}/api/tenants/consent/callback?${new URLSearchParams({ state, tenant: "5b0f3c1e-2a47-4d1e-9a60-1c5d8f2b7e90", admin_consent: "True" })}`, { maxRedirects: 0 });
    }
  }
  await page.request.post(`${BASE}/api/tenants/${ids[1]}/consent-link`, { data: { email: "it-admin@bluebird.test" }, headers: origin });
  await page.request.post(`${BASE}/api/rings`, { data: { tenantId: ids[0], pilot: { id: "g-pilot", name: "DC-Pilot" }, broad: { id: "g-broad", name: "DC-Broad" } }, headers: origin });
  for (const v of ["7-zip@25.01", "google-chrome@152.0.6913"]) {
    const r = await page.request.post(`${BASE}/api/deployments`, { data: { tenantId: ids[0], versionId: v }, headers: origin });
    if (!r.ok()) throw new Error(`publish ${v} failed: ${r.status()} ${await r.text()}`);
  }

  const problems: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
      for (const [name, path] of [["dock", `/app?tenant=${ids[0]}&app=7-zip`], ["dock-waiting", `/app?tenant=${ids[1]}`], ["tenants", "/app/tenants"]] as const) {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) problems.push(`${path} @${width} ${theme}: horizontal overflow ${overflow}px`);
        await page.screenshot({ path: `${OUT}/${name}-${width}-${theme}.png`, fullPage: true });
      }
    }
  }
  await browser.close();
  console.log(`screenshots in ${OUT}`);
  if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
}
main().catch((e) => { console.error(e); process.exit(1); });
