// Competitor and reference site screenshots for docs/design-brief.md (1440 and 375, light).
//   node scripts/screenshots-refs.mjs <out-dir> name=https://example.com ...   (SEG=1 also writes full page segments)
import { chromium } from "@playwright/test";
const [,, outdir, ...pairs] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", args:["--no-sandbox"] });
for (const p of pairs) {
  const [name, url] = p.split("=");
  for (const w of [1440, 375]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w===1440?900:812 }, colorScheme: "light" });
    const pg = await ctx.newPage();
    try {
      await pg.goto(url, { waitUntil: "load", timeout: 30000 });
      await pg.waitForTimeout(800);
      await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await pg.waitForTimeout(900);
      await pg.screenshot({ path: `${outdir}/${name}-${w}.png`, fullPage: false });
      await pg.screenshot({ path: `${outdir}/${name}-${w}-full.png`, fullPage: true });
      if (process.env.SEG) {
        const H = await pg.evaluate(() => document.documentElement.scrollHeight);
        const seg = w === 1440 ? 1800 : 1600;
        for (let i = 0, y = 0; y < H; i++, y += seg) await pg.screenshot({ path: `${outdir}/${name}-${w}-seg${i}.png`, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(seg, H - y) } });
      }
    } catch (e) { console.log(name, w, String(e).slice(0,120)); }
    await ctx.close();
  }
}
await b.close();
