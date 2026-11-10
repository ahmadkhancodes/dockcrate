import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { clearPriceCache } from "@/lib/billing/catalog";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { sendConsentLink, createTenant } from "@/lib/tenants";
import type { Deps } from "@/lib/deps";
import { getDb } from "@/lib/db";
import { event, fakeStripe } from "./fakes";

let db: Db;
let f: ReturnType<typeof fakeStripe>;
beforeEach(() => { db = createMemoryDb("dockcrate"); f = fakeStripe(); clearPriceCache(); });

describe("Stripe webhook edge cases", () => {
  it("answers 200 for an unknown event type and changes no plan", async () => {
    await db.upsertBillingAccount({ id: "o1", stripeCustomerId: "cus_1", email: "a@b.test" });
    const r = await handleStripeWebhook(event("totally.unknown", { customer: "cus_1" }), "good", { stripe: f.stripe, db, secret: "x", now: () => 1 });
    expect(r.status).toBe(200);
    expect(await db.getEntitlement("o1")).toBeNull();
  });
  it("a processing failure is not recorded, so the Stripe retry reprocesses it", async () => {
    await db.upsertBillingAccount({ id: "o1", stripeCustomerId: "cus_1", email: "a@b.test" });
    const body = event("customer.subscription.updated", { customer: "cus_1" }, "evt_fail");
    const broken = { ...f.stripe, subscriptions: { ...f.stripe.subscriptions, list: async () => { throw new Error("stripe down"); } } } as unknown as typeof f.stripe;
    await expect(handleStripeWebhook(body, "good", { stripe: broken, db, secret: "x" })).rejects.toThrow();
    expect(await db.hasStripeEvent("evt_fail")).toBe(false);
    const ok = await handleStripeWebhook(body, "good", { stripe: f.stripe, db, secret: "x" });
    expect(ok.status).toBe(200);
    expect(await db.hasStripeEvent("evt_fail")).toBe(true);
  });
});

describe("mail provider rejection", () => {
  it("consent link: 502 mail_unavailable, no provider text, tenant status untouched", async () => {
    const deps: Deps = {
      db: await getDb(), graph: undefined as never, baseUrl: "https://dockcrate.test", now: () => new Date(),
      sendMail: async () => { throw new Error("mail_send_failed_422 re_SECRET invalid address"); },
    };
    const t = await createTenant(deps, { orgId: "org-mail", name: "Contoso", actorId: null });
    const err = await sendConsentLink(deps, t, "bad@contoso.test", null).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "mail_unavailable" });
    expect(String(err.message)).not.toContain("SECRET");
    expect((await deps.db.collection<{ id: string; status: string }>("tenants").get(t.id))?.status).toBe(t.status);
  });
});
