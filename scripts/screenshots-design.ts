/**
 * Design QA screenshots (docs/design-brief.md section 8): marketing pages and every signed-in screen at 1440 and 375, light.
 * Stub mode only: memory DB, fake Graph, console mail, E2E_OUTBOX=1 and a dummy ENTRA_CLIENT_ID so a tenant can be created.
 *   BASE_URL=http://localhost:3100 CHROME_PATH=/usr/bin/chromium OUT_DIR=docs/qa/design npx tsx scripts/screenshots-design.ts [only-name ...]
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.OUT_DIR ?? "docs/qa/design";
const only = process.argv.slice(2);

async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const origin = { origin: BASE };
  const problems: string[] = [];

  const shoot = async (name: string, path: string, widths = [1440, 375]) => {
    if (only.length && !only.includes(name)) return;
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${path} @${width}: horizontal overflow ${overflow}px`);
      await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
    }
  };

  for (const [name, path] of [["home", "/"], ["pricing", "/pricing"], ["security", "/security"], ["catalog", "/catalog"], ["catalog-7-zip", "/catalog/7-zip"], ["compare-pckgr", "/compare/pckgr"], ["docs", "/docs"], ["early-access", "/early-access"], ["sign-in", "/sign-in"], ["not-found", "/no-such-page"]] as const) await shoot(name, path);

  const email = `design+${Date.now()}@msp.test`;
  await page.request.post(`${BASE}/api/auth/sign-in/magic-link`, { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await page.request.get(`${BASE}/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  await shoot("app-onboarding", "/onboarding", [1440]);
  const org = await (await page.request.post(`${BASE}/api/auth/organization/create`, { data: { name: "Northbay IT", slug: `northbay-${Date.now()}` }, headers: origin })).json();
  await page.request.post(`${BASE}/api/auth/organization/set-active`, { data: { organizationId: org.id }, headers: origin });

  await shoot("app-dock-empty", "/app");
  const r = await (await page.request.post(`${BASE}/api/tenants`, { data: { name: "Halvorsen Dental" }, headers: origin })).json();
  if (!r.tenant) throw new Error(`tenant create failed: ${JSON.stringify(r)}`);
  await shoot("app-tenants-waiting", "/app/tenants");
  await page.request.post(`${BASE}/api/dev/connect-tenant?id=${r.tenant.id}`, { headers: origin });
  await page.request.post(`${BASE}/api/rings`, { data: { tenantId: r.tenant.id, pilot: { id: "g-pilot", name: "DC-Pilot" }, broad: { id: "g-broad", name: "DC-Broad" } }, headers: origin });
  for (const v of ["7-zip@25.01", "google-chrome@152.0.6913"]) {
    const res = await page.request.post(`${BASE}/api/deployments`, { data: { tenantId: r.tenant.id, versionId: v }, headers: origin });
    if (!res.ok()) problems.push(`publish ${v}: ${res.status()} ${await res.text()}`);
  }
  for (const [name, path] of [
    ["app-dock", `/app?tenant=${r.tenant.id}&app=7-zip`], ["app-tenants", "/app/tenants"], ["app-msp", "/app/msp"], ["app-app-sets", "/app/app-sets"],
    ["app-rings", `/app/rings/${r.tenant.id}`], ["app-billing", "/app/billing"], ["app-profile", "/app/settings/profile"], ["app-security", "/app/settings/security"],
    ["app-notifications", "/app/settings/notifications"], ["app-members", "/app/settings/members"], ["app-api-keys", "/app/settings/api-keys"],
    ["app-webhooks", "/app/settings/webhooks"], ["app-audit", "/app/settings/audit"],
  ] as const) await shoot(name, path);

  await browser.close();
  console.log(`screenshots in ${OUT}`);
  if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
}
main().catch((e) => { console.error(e); process.exit(1); });
