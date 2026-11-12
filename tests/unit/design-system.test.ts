// Guards for the "yard" identity (docs/design-brief.md): fonts, tokens, retired brand colours, banned AI tells, motion, and the dev only tenant route.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST as connectTenant } from "@/app/api/dev/connect-tenant/route";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const tsx = walk("src").filter((f) => /\.(tsx|ts)$/.test(f));
const css = readFileSync("src/app/globals.css", "utf8");
const all = tsx.map((f) => readFileSync(f, "utf8")).join("\n");

const brandTs = readFileSync("src/lib/brand.ts", "utf8");
const mail = readFileSync("src/lib/mail/templates.ts", "utf8");
const og = ["src/app/opengraph-image.tsx", "src/app/icon.tsx", "src/app/apple-icon.tsx", "src/lib/legal-html.ts"].map((f) => readFileSync(f, "utf8")).join("\n");

describe("type system", () => {
  it("loads Saira Stencil, IBM Plex Sans and IBM Plex Mono through next/font and nothing else", () => {
    const fonts = readFileSync("src/app/fonts.ts", "utf8");
    expect(fonts).toMatch(/import \{ Saira_Stencil, IBM_Plex_Sans, IBM_Plex_Mono \} from "next\/font\/google"/);
  });
  it("keeps the stencil to heading-1 and the stencil utility; every other heading is Plex Sans", () => {
    expect(css).toMatch(/@utility heading-1 \{[^}]*font-display-family/);
    for (const h of ["heading-2", "heading-3", "heading-4", "heading-5", "heading-6"]) {
      expect(css).not.toMatch(new RegExp(`@utility ${h} \\{[^}]*font-display-family`));
    }
    expect(all).not.toMatch(/Big_Shoulders|font-stretch|stencil-(lg|md)|font-stencil|border-dashed/);
    expect(all + css).not.toMatch(/\b(Inter|Geist|Roboto|Helvetica|Open Sans)\b/);
  });
});

describe("colour tokens", () => {
  it("retired brand colours are gone everywhere: change sheet white/lime/blue, cream, dock green, amber, mail greys", () => {
    const retired = /#d7f25c|#2c55d9|#15181c|#f4f5f6|#f6f5f2|#1f5c4a|#e3a21a|#15191c|#e8e6e1|#14181c|#9aa3a9|#181818|#f7f7f7|#767676|#404040|#e2e2e2|lime|Archivo|Public_Sans|Public Sans|JetBrains/i;
    expect(all + css).not.toMatch(retired);
    expect(mail + og).not.toMatch(/#181818|#f7f7f7|background:#ffffff|#1f5c4a|#e3a21a/i);
    expect(all + css).not.toMatch(/indigo|violet|purple/i);
  });
  it("defines concrete surfaces, graphite ink and the teal action", () => {
    expect(css).toMatch(/--surface: var\(--c-100\)/);
    expect(css).toMatch(/--text: var\(--c-900\)/);
    expect(css).toMatch(/--action: var\(--teal-600\)/);
    expect(css).toMatch(/--mark: var\(--teal-100\)/);
    expect(css).not.toMatch(/--surface-raised: #fff|--surface-raised: var\(--n-0\)/i);
  });
  it("keeps src/lib/brand.ts in step with the CSS ramp (mail, OG and favicon use it)", () => {
    for (const [k, v] of [["concrete", "--c-100"], ["panel", "--c-50"], ["ink", "--c-900"], ["teal", "--teal-600"], ["tealWash", "--teal-100"]]) {
      const hex = new RegExp(`${k}: "(#[0-9a-f]{6})"`).exec(brandTs)?.[1];
      expect(hex, k).toBeTruthy();
      expect(css).toContain(`${v}: ${hex};`);
    }
    expect(mail).toMatch(/brand\.teal/);
    expect(og).toMatch(/brand\.concrete/);
  });
  it("uses a radius per object, not one radius everywhere", () => {
    for (const r of ["--radius-sm: 0px", "--radius-md: 3px", "--radius-lg: 4px", "--radius-xl: 8px"]) expect(css).toContain(r);
    expect(all).not.toMatch(/rounded-full[^"]*px-\d[^"]*(New|Beta)/);
  });
  it("draws the safety stripe as an SVG tile, not a gradient", () => {
    expect(css).toMatch(/@utility hazard \{[^}]*data:image\/svg\+xml/);
  });
});

describe("banned AI tells", () => {
  it("has no background gradients, glassmorphism or vague filler in the source", () => {
    expect(all + css).not.toMatch(/bg-gradient|linear-gradient|radial-gradient/);
    // The only blur is the floating marketing nav (library B7: translucent bar over a background blur, D-63).
    const blurred = tsx.filter((f) => /backdrop-blur/.test(readFileSync(f, "utf8"))).map((f) => f.replace(/\\/g, "/"));
    expect(blurred).toEqual(["src/components/marketing/site-header.tsx"]);
    expect(tsx.filter((f) => /marketing|\(marketing\)/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n")).not.toMatch(/streamline|seamless|supercharge|everything you need/i);
  });
});

describe("motion", () => {
  it("draws the teal wash with transform only and shows it at once under reduced motion", () => {
    expect(css).toMatch(/@keyframes mark-draw \{ from \{ transform: scaleX\(0\); \} to \{ transform: scaleX\(1\); \} \}/);
    const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm).toMatch(/\.mark-draw::before \{ animation: none; \}/);
  });
});

describe("dev connect tenant route", () => {
  const prev = process.env.E2E_OUTBOX;
  afterEach(() => { if (prev === undefined) delete process.env.E2E_OUTBOX; else process.env.E2E_OUTBOX = prev; });
  it("is a 404 unless E2E_OUTBOX=1", async () => {
    delete process.env.E2E_OUTBOX;
    const res = await connectTenant(new Request("http://localhost/api/dev/connect-tenant?id=x", { method: "POST" }), {});
    expect(res.status).toBe(404);
  });
});
