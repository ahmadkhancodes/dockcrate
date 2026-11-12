// Landing page compliance with the design library (B1, B3, B4, B5, B7, B11) and the "no hyphens in copy" rule.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { earlyAccessCopy, plans, product } from "@/config/product";

const read = (p: string) => readFileSync(p, "utf8");
const css = read("src/app/globals.css");
const marketingFiles = [
  "src/app/(marketing)/page.tsx",
  "src/app/(marketing)/pricing/page.tsx",
  "src/components/marketing/hero.tsx",
  "src/components/marketing/problem.tsx",
  "src/components/marketing/features.tsx",
  "src/components/marketing/how-it-works.tsx",
  "src/components/marketing/faq.tsx",
  "src/components/marketing/final-cta.tsx",
  "src/components/marketing/trust.tsx",
  "src/components/marketing/pricing-table.tsx",
  "src/components/marketing/site-footer.tsx",
  "src/components/marketing/site-header.tsx",
  "src/components/dock/dock-preview.tsx",
];

/** Visible copy: JSX text nodes and the string values of copy keys and copy props. */
function copyStrings(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.push(m[1]!.trim());
  const keys = "title|body|q|a|label|subtitle|eyebrow|note|detail|rule|text|tagline|description|cta|ours|next|caption";
  for (const m of src.matchAll(new RegExp(`\\b(?:${keys})(?::\\s*|=)"([^"]+)"`, "g"))) out.push(m[1]!);
  return out.filter(Boolean);
}
// Identifiers that legitimately carry a hyphen (B1 exception: code, slugs, product identifiers, hashes).
// DC-Pilot and DC-Broad are sample Entra group names (sample data keeps its hyphens).
const allowed = /SHA-256|\bDC-[A-Za-z]+|[a-z0-9]+(-[a-z0-9]+)+\.(ts|tsx|json)|\/[a-z0-9-]+/g;
const hyphenated = (s: string) => s.replace(allowed, "").match(/\b[A-Za-z]+-[A-Za-z]+\b/g) ?? [];

describe("copy has no hyphenated words", () => {
  it("in the landing, pricing and shared marketing components", () => {
    const hits = marketingFiles.flatMap((f) => copyStrings(read(f)).flatMap((s) => hyphenated(s).map((h) => `${f}: ${h}`)));
    expect(hits).toEqual([]);
  });
  it("in product copy rendered on marketing pages", () => {
    const strings = [product.tagline, product.description, ...Object.values(earlyAccessCopy), ...plans.flatMap((p) => [p.tagline, p.cta, ...p.highlights])];
    expect(strings.flatMap(hyphenated)).toEqual([]);
  });
});

describe("type scale (B1)", () => {
  const steps = new Set([12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128]);
  it("every font size in the global CSS lands on a Tailwind step", () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].map((m) => (m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1])));
    expect(sizes.length).toBeGreaterThan(20);
    expect(sizes.filter((s) => !steps.has(s))).toEqual([]);
  });
  it("no weight above 700 and no italics", () => {
    const weights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(weights.every((w) => w <= 700)).toBe(true);
    const all = css + marketingFiles.map(read).join("\n");
    expect(all).not.toMatch(/\bitalic\b|font-(extrabold|black)|text-\[\d/);
  });
});

describe("hero (B5)", () => {
  const hero = read("src/components/marketing/hero.tsx");
  it("caps the heading and subheading at 680px with balanced and pretty wrapping", () => {
    expect(hero).toMatch(/<h1[^>]*max-w-\[680px\]/);
    expect(hero).toMatch(/<p className="body-3 max-w-\[680px\]/);
    expect(css).toMatch(/@utility heading-1 \{[^}]*text-wrap: balance/);
    expect(css).toMatch(/@utility body-3 \{[^}]*text-wrap: pretty/);
  });
  it("has one CTA above the fold on the home page", () => {
    expect(read("src/app/(marketing)/page.tsx")).not.toMatch(/secondaryCta=/);
  });
});

describe("borders (B4)", () => {
  it("no single sided accent bars on landing cards and rows", () => {
    const all = marketingFiles.map(read).join("\n");
    expect(all).not.toMatch(/shadow-\[inset_\d+px_0|border-l-(2|4)[^"]*border-accent/);
  });
});

describe("motion (B7) and the tagline reveal (B11)", () => {
  const reveal = read("src/components/marketing/tagline-reveal.tsx");
  it("lights words one by one with an IntersectionObserver, not a scroll listener", () => {
    expect(reveal).toMatch(/new IntersectionObserver/);
    expect(reveal).not.toMatch(/addEventListener\("scroll"/);
  });
  it("words wait at 25 to 35% of the ink and show at full ink under reduced motion", () => {
    const base = Number(css.match(/\.kit-word \{ opacity: ([\d.]+)/)?.[1]);
    expect(base).toBeGreaterThanOrEqual(0.25);
    expect(base).toBeLessThanOrEqual(0.35);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*\.kit-word \{ opacity: 1 !important; transition: none !important; \}/);
    expect(reveal).toMatch(/prefers-reduced-motion: reduce/);
  });
  it("the reveal is not stacked directly under the hero", () => {
    const page = read("src/app/(marketing)/page.tsx");
    const afterHero = page.slice(page.indexOf("<Hero"));
    const firstSection = afterHero.search(/<Section|<Problem|<HowItWorks/);
    expect(afterHero.indexOf("<TaglineReveal")).toBeGreaterThan(firstSection);
  });
  it("nav floats off the top edge on a blurred surface, menu stagger is 60ms capped at 400ms", () => {
    const header = read("src/components/marketing/site-header.tsx");
    expect(header).toMatch(/fixed inset-x-0 top-3/);
    expect(header).toMatch(/backdrop-blur/);
    expect(header).toMatch(/STAGGER_MS = 60/);
    expect(header).toMatch(/STAGGER_CAP_MS = 400 - STAGGER_MS/);
    expect(header).not.toMatch(/duration-(75|100|150|200)\b/);
  });
});
