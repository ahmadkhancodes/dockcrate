// Accessibility: contrast computed over the real tokens in src/app/globals.css (WCAG 2.2), plus structural checks on the four app pages.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf("\n}", start);
  const out: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+):\s*([^;]+?);/g)) out[m[1]!] = m[2]!.replace(/\/\*.*?\*\//g, "").trim();
  return out;
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function resolve(theme: Record<string, string>, name: string): string {
  let v = theme[`--${name}`];
  for (let i = 0; i < 5 && v?.startsWith("var("); i++) v = theme[v.slice(4, -1).trim()];
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`token ${name} does not resolve to a hex colour: ${v}`);
  return v;
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

// [foreground, background, minimum ratio, why]
const TEXT = 4.5, UI = 3;
const PAIRS: [string, string, number][] = [
  ["text", "surface", TEXT], ["text", "surface-raised", TEXT], ["text", "surface-sunken", TEXT],
  ["text-subtle", "surface", TEXT], ["text-subtle", "surface-raised", TEXT], ["text-subtle", "surface-sunken", TEXT],
  ["text-muted", "surface", TEXT], ["text-muted", "surface-raised", TEXT],
  ["text-inverse", "surface-inverse", TEXT],
  ["action-text", "action", TEXT], ["action-text", "action-hover", TEXT],
  ["action", "surface", TEXT], ["action", "surface-raised", TEXT], // links and tertiary buttons
  ["success", "success-surface", TEXT], ["warning", "warning-surface", TEXT], ["danger", "danger-surface", TEXT],
  ["success", "surface", TEXT], ["warning", "surface", TEXT], ["danger", "surface", TEXT],
  ["text", "success-surface", TEXT], ["text", "warning-surface", TEXT], ["text", "danger-surface", TEXT],
  ["on-amber", "amber", TEXT],
  // non text: focus ring, input borders
  ["focus", "surface", UI], ["focus", "surface-raised", UI], ["focus", "surface-sunken", UI],
  ["control-border", "surface", UI], ["control-border", "surface-raised", UI],
];

describe.each([["light", light], ["dark", dark]] as const)("contrast on the real %s tokens", (_name, theme) => {
  it.each(PAIRS)("%s on %s is at least %s:1", (fg, bg, min) => {
    expect(contrast(resolve(theme, fg), resolve(theme, bg))).toBeGreaterThanOrEqual(min);
  });
});

describe("focus and motion rules in the stylesheet", () => {
  it("has a global visible focus outline of at least 2px using the focus token", () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--focus\)/);
  });
  it("turns transitions and animations off under prefers-reduced-motion", () => {
    const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm).toMatch(/animation-duration:\s*0\.01ms/);
    expect(rm).toMatch(/transition-duration:\s*0\.01ms/);
  });
});

const read = (p: string) => readFileSync(p, "utf8");

describe("keyboard and labels on the dock, tenants, rings and App Sets pages", () => {
  it("the app shell has a skip link to the focusable main landmark", () => {
    const shell = read("src/components/app/app-shell.tsx");
    expect(shell).toMatch(/href="#main"/);
    expect(shell).toMatch(/<main id="main" tabIndex=\{-1\}/);
  });
  it("Field ties its hint and error to the control (aria-describedby, aria-invalid)", () => {
    const f = read("src/components/ui/field.tsx");
    expect(f).toContain("aria-describedby");
    expect(f).toContain("aria-invalid");
  });
  it("lists are named and repeated buttons say what they act on", () => {
    expect(read("src/app/app/page.tsx")).toContain('aria-label="Apps"');
    expect(read("src/app/app/tenants/tenants-client.tsx")).toContain('aria-label="Tenants"');
    const sets = read("src/app/app/app-sets/app-sets-client.tsx");
    expect(sets).toContain("aria-label={`Run ${set.name} on tenants`}");
    expect(sets).toContain("aria-label={`Delete ${set.name}`}");
    expect(sets).toContain("aria-controls=");
  });
  it("dock rows keep their focus outline inside the clipped panel", () => {
    expect(read("src/app/app/page.tsx")).toContain("focus-visible:[outline-offset:-2px]");
  });
  it("every control on the rings form is labelled through Field or a wrapping label", () => {
    const rings = read("src/app/app/rings/[tenantId]/rings-client.tsx");
    const inputs = [...rings.matchAll(/<(Input|Select) id="([\w-]+)"/g)].map((m) => m[2]);
    expect(inputs.length).toBeGreaterThanOrEqual(7);
    for (const id of inputs) expect(rings).toContain(`htmlFor="${id}"`);
  });
});
