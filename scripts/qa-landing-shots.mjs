import { chromium } from "@playwright/test";
const [,, base, tag, out] = process.argv;
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
for (const w of [375, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.emulateMedia({ colorScheme: "light" });
  await p.goto(base + "/", { waitUntil: "networkidle" });
  const m = await p.evaluate(() => {
    const h = document.querySelector("h1"), s = document.querySelector("#hero-title")?.closest("section")?.querySelector("p.body-3");
    const sizes = new Set(); for (const el of document.querySelectorAll("body *")) { if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) sizes.add(getComputedStyle(el).fontSize); }
    return { h1w: h?.getBoundingClientRect().width, h1text: h?.textContent, subw: s?.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth, sizes: [...sizes] };
  });
  console.log(tag, w, JSON.stringify(m));
  await p.screenshot({ path: `${out}/home-${tag}-${w}.png`, fullPage: true });
  // tagline reveal: read opacity per word before and after scrolling
  const words = p.locator(".kit-word");
  await words.first().scrollIntoViewIfNeeded();
  await p.mouse.wheel(0, 300); await p.waitForTimeout(1500);
  const ops = await words.evaluateAll(ws => ws.map(w => getComputedStyle(w).opacity));
  console.log(tag, w, "words", ops.join(","));
  await p.close();
}
const r = await b.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
const rp = await r.newPage(); await rp.goto(base + "/", { waitUntil: "networkidle" });
console.log(tag, "reduced", (await rp.locator(".kit-word").evaluateAll(ws => ws.map(w => getComputedStyle(w).opacity))).join(","));
await b.close();
