import { describe, expect, it } from "vitest";
import { ctaFor, pricingCtaFor } from "@/components/marketing/session-labels";

const out = { href: "/sign-in", label: "Start free with Microsoft" };

describe("session-aware marketing labels", () => {
  it("keeps the signed-out call to action untouched", () => {
    expect(ctaFor(false, out)).toEqual(out);
    expect(pricingCtaFor(false, { id: "starter", cta: "Choose Starter", free: false }, "month", out)).toEqual(out);
  });
  it("sends signed-in visitors to the app, never to signup", () => {
    expect(ctaFor(true, out)).toEqual({ href: "/app", label: "Open your dock" });
  });
  it("pricing: free opens the app, paid goes to billing with the plan preselected", () => {
    expect(pricingCtaFor(true, { id: "free", cta: "Start free", free: true }, "month", out).href).toBe("/app");
    expect(pricingCtaFor(true, { id: "starter", cta: "Choose Starter", free: false }, "year", out)).toEqual({ href: "/app/billing?plan=starter&interval=year", label: "Choose Starter" });
  });
});
