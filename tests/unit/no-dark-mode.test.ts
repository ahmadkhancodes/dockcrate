// Regression guard: the product is light only. Fails if dark mode or a theme toggle comes back.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|css|mjs|html)$/.test(n)) out.push(p);
  }
  return out;
}
const sources = ["src", "scripts", "tests/e2e"].flatMap((d) => files(d));
const self = "tests/unit/no-dark-mode.test.ts";
const offenders = (re: RegExp) => sources.filter((f) => re.test(readFileSync(f, "utf8")));

describe("light only", () => {
  it("has no dark: utility classes", () => expect(offenders(/(^|[\s"'`:])dark:[\w\[!-]/m)).toEqual([]));
  it("has no prefers-color-scheme: dark", () => expect(offenders(/prefers-color-scheme:\s*dark/)).toEqual([]));
  it("has no data-theme, .dark token sets or dark custom variant", () => {
    expect(offenders(/data-theme|dataset\.theme|@custom-variant dark|\.dark\s*\{|color-scheme:\s*dark/)).toEqual([]);
  });
  it("has no theme toggle, init script or stored theme key", () => {
    expect(offenders(/ThemeToggle|themeInitScript|theme-script|localStorage\.(get|set)Item\(["']theme/)).toEqual([]);
  });
  it("declares color-scheme light and one theme-color", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/color-scheme:\s*light/);
    expect(readFileSync("src/app/layout.tsx", "utf8")).toMatch(/themeColor: "#[0-9a-f]{6}"/i);
  });
  void self;
});
