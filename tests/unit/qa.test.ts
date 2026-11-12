import { describe, expect, it } from "vitest";
import { newUserCallback } from "@/components/app/redirect";
import { outbox } from "@/lib/mail/transports";

describe("QA regressions", () => {
  it("a new user who came to accept an invitation goes straight to it, everyone else to onboarding", () => {
    expect(newUserCallback("/accept-invite/abc")).toBe("/accept-invite/abc");
    expect(newUserCallback("/app")).toBe("/onboarding?next=%2Fapp");
    expect(newUserCallback("/app/billing?plan=starter")).toBe("/onboarding?next=%2Fapp%2Fbilling%3Fplan%3Dstarter");
  });

  it("the dev outbox lives on globalThis so every server layer shares it", () => {
    expect((globalThis as { __dcOutbox?: unknown }).__dcOutbox).toBe(outbox);
  });
});

describe("QA2 copy consistency", () => {
  it("no demo crate shows the VM check as passed (D-01: it has not run for any version)", async () => {
    const { demoCrates } = await import("@/content/demo");
    for (const c of demoCrates) expect(c.checks.vm, c.name).not.toBe("pass");
  });
  it("the retired inline mono font stack is gone from the marketing SVG", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/components/marketing/trust.tsx", "utf8")).not.toMatch(/ui-monospace/);
  });
});
