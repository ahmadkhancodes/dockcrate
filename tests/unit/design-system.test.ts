// Guards for the "change sheet" redesign (docs/design-brief.md): fonts, tokens, banned AI tells, motion, and the dev only tenant route.
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

describe("type system", () => {
  it("loads Archivo, Public Sans and JetBrains Mono through next/font and nothing else", () => {
    const fonts = readFileSync("src/app/fonts.ts", "utf8");
    expect(fonts).toMatch(/import \{ Archivo, Public_Sans, JetBrains_Mono \} from "next\/font\/google"/);
    expect(fonts).toMatch(/axes: \["wdth"\]/);
  });
  it("drops the old stencil look and never uses a banned family", () => {
    expect(all).not.toMatch(/Big_Shoulders|stencil-(lg|md)|font-stencil|border-dashed/);
    expect(all + css).not.toMatch(/\b(Inter|Geist|Roboto|Helvetica|Open Sans)\b/);
  });
  it("headings use the expanded display face", () => {
    expect(css).toMatch(/@utility heading-1 \{[^}]*font-display-family[^}]*font-stretch: 112%/);
  });
});

describe("colour tokens", () => {
  it("has no cream or dock green left, and no purple or indigo accent", () => {
    expect(css).not.toMatch(/#f6f5f2|#1f5c4a|#e3a21a/i);
    expect(all + css).not.toMatch(/indigo|violet|purple/i);
  });
  it("defines the lime mark with graphite text and a graphite action", () => {
    expect(css).toMatch(/--mark: var\(--lime-300\)/);
    expect(css).toMatch(/--on-mark: var\(--n-900\)/);
    expect(css).toMatch(/--action: var\(--n-900\)/);
  });
  it("uses a radius per object, not one radius everywhere", () => {
    for (const r of ["--radius-sm: 2px", "--radius-md: 4px", "--radius-lg: 6px", "--radius-xl: 8px"]) expect(css).toContain(r);
    expect(all).not.toMatch(/rounded-full[^"]*px-\d[^"]*(New|Beta)/);
  });
});

describe("banned AI tells", () => {
  it("has no background gradients, glassmorphism or vague filler in the source", () => {
    expect(all + css).not.toMatch(/bg-gradient|linear-gradient|radial-gradient|backdrop-blur/);
    expect(tsx.filter((f) => /marketing|\(marketing\)/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n")).not.toMatch(/streamline|seamless|supercharge|everything you need/i);
  });
});

describe("motion", () => {
  it("draws the lime mark with transform only and shows it at once under reduced motion", () => {
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
