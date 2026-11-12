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
