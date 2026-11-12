import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { UNLIMITED, freePlan, planById, product } from "@/config/product";
import { apiKeySnippet } from "@/content/docs/snippets";
import { getDoc } from "@/content/docs";
import { can } from "@/lib/auth/roles";
import { ROLE_TEXT } from "@/lib/auth/role-text";
import { clearPriceCache } from "@/lib/billing/catalog";
import { checkoutReturnUrls, createCheckoutSession, createPortalSession } from "@/lib/billing/checkout";
import { assertCanAddTenant, orgLimits, upgradeFor, limitStates } from "@/lib/billing/limits";
import { bannerMeter, usageState } from "@/lib/billing/usage";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { inviteEmail } from "@/lib/mail/templates";
import { guessRingGroups } from "@/lib/rings/guess-groups";
import { RULES } from "@/lib/security/ratelimit";
import type { Tenant } from "@/lib/tenants";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { signPayload } from "@/lib/webhooks/outbound";
import { event, fakeStripe } from "./fakes";

const doc = (slug: string) => {
  const d = getDoc(slug);
  if (!d) throw new Error(`no doc ${slug}`);
  return d;
};
const text = (slug: string) => doc(slug).sections.flatMap((s) => [s.heading, ...s.body, s.code?.code ?? ""]).join("\n");

describe("day 1: no false alarm once the first tenant is connected", () => {
  it("a Free org using its one tenant gets no app-wide banner; devices still warn at 80% and 100%", () => {
    const free = freePlan.limits;
    expect(bannerMeter([usageState("devices", 0, free.devices), usageState("tenants", 1, free.tenants), usageState("catalog_apps", 15, free.catalog_apps)])).toBeNull();
    expect(bannerMeter([usageState("devices", 20, 25), usageState("tenants", 1, 1)])?.meter).toBe("devices");
    expect(bannerMeter([usageState("devices", 25, 25)])?.level).toBe("over");
    // Over an allowance (for example after a downgrade) is still shown.
    expect(bannerMeter([usageState("devices", 0, 25), usageState("tenants", 3, 1)])?.meter).toBe("tenants");
  });

  it("the tenant cap names the cheapest plan that lifts it, with a checkout deep link", () => {
    const u = upgradeFor(freePlan, "tenants")!;
    const starter = planById("starter")!;
    expect(u).toEqual({ planId: "starter", planName: "Starter", limit: starter.limits.tenants, monthlyUsd: 24.99, href: "/app/billing?plan=starter&interval=month" });
    expect(upgradeFor(starter, "tenants")?.planId).toBe("professional");
    expect(upgradeFor(planById("fleet")!, "devices")).toBeNull();
  });
});

describe("ring picker defaults", () => {
  it("preselects DC-Pilot / DC-Broad and the usual names, never the same group twice", () => {
    expect(guessRingGroups([{ id: "a", displayName: "All Staff" }, { id: "p", displayName: "DC-Pilot" }, { id: "b", displayName: "DC-Broad" }])).toEqual({ pilot: "p", broad: "b" });
    expect(guessRingGroups([{ id: "t", displayName: "IT Testers" }, { id: "u", displayName: "All Users" }])).toEqual({ pilot: "t", broad: "u" });
    expect(guessRingGroups([{ id: "x", displayName: "Finance" }, { id: "y", displayName: "Sales" }])).toEqual({ pilot: "", broad: "" });
    expect(guessRingGroups([{ id: "p", displayName: "Pilot and Broad" }])).toEqual({ pilot: "p", broad: "" });
  });
});

describe("invitations explain themselves", () => {
  it("role lines match the real permission table", () => {
    expect(can("admin", "billing", "manage")).toBe(false);
    expect(can("operator", "deployment", "rollback")).toBe(true);
    expect(can("operator", "tenant", "connect")).toBe(false);
    expect(can("operator", "ring", "configure")).toBe(false);
    expect(can("operator", "apiKey", "manage")).toBe(false);
    expect(can("viewer", "deployment", "publish")).toBe(false);
    expect(ROLE_TEXT.operator).toMatch(/Cannot connect tenants, change rings/);
    // The docs list the same four roles, not the kit's old "member" role.
    const auth = text("authentication");
    for (const r of ["Owner", "Admin", "Operator", "Viewer"]) expect(auth).toContain(`${r}`);
    expect(auth).not.toMatch(/\bmember and viewer roles\b|\bMembers can read\b/);
  });

  it("the invitation e-mail says what the role can do and how long the link works", () => {
    const m = inviteEmail({ orgName: "Buckeye MSP", inviter: "mike@buckeye.test", url: "https://x.test/accept-invite/1", role: "operator" });
    expect(m.text).toContain(ROLE_TEXT.operator);
    expect(m.text).toContain("7 days");
    expect(m.html).toContain("7 days");
  });
});

describe("docs match the product", () => {
  it("the webhook verification sample in the docs runs in plain Node and accepts our real signature", async () => {
    const code = doc("webhooks").sections.find((s) => s.code?.lang === "js")!.code!.code;
    const secret = "whsec_doc_test";
    const body = JSON.stringify({ id: "evt_1", type: "test.ping", created: 1, data: { message: "Test event" } });
    const now = Math.floor(Date.now() / 1000);
    const good = await signPayload(secret, body, now);
    const old = await signPayload(secret, body, now - 3600);
    const script = `${code}\nconst [b, g, o, s] = JSON.parse(process.argv[1]);\nconsole.log(JSON.stringify([verify(b, g, s), verify(b + " ", g, s), verify(b, o, s), verify(b, g, "whsec_wrong")]));`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script, JSON.stringify([body, good, old, secret])], { encoding: "utf8" });
    expect(JSON.parse(out)).toEqual([true, false, false, false]);
  });

  it("the webhook events in the docs are exactly the ones the settings page offers and the app sends", () => {
    const w = text("webhooks");
    for (const e of WEBHOOK_EVENTS) expect(w).toContain(e);
    expect(w).toContain("up to 20 endpoints");
    expect(readFileSync("src/app/api/webhooks/route.ts", "utf8")).toContain(".length >= 20) throw");
  });

  it("the getting started limits and the API rate limit are the code's numbers", () => {
    const g = text("getting-started");
    expect(g).toContain(`${freePlan.limits.devices} devices, ${freePlan.limits.tenants} tenant and ${freePlan.limits.catalog_apps} catalog apps`);
    expect(g).not.toMatch(/let us create/);
    expect(text("api")).toContain(`${RULES.api.limit} requests per minute`);
    expect(RULES.api.windowMs).toBe(60_000);
    expect(text("billing")).toContain(`${product.graceDays} days`);
  });

  it("the curl sample is one shared snippet, personalised with the real URL and key in the app", () => {
    expect(doc("authentication").sections.find((s) => s.code)!.code!.code).toBe(apiKeySnippet(product.url));
    expect(apiKeySnippet("http://localhost:3100/", "dock_abc")).toBe('curl http://localhost:3100/api/v1/me \\\n  -H "x-api-key: dock_abc"');
  });
});

describe("pricing numbers equal the enforced limits", () => {
  const fmt = (n: number) => n.toLocaleString("en-US");
  it("every limit a plan advertises is the limit the code enforces", () => {
    for (const p of product.plans) {
      const h = p.highlights.join(" | ");
      expect(h, p.id).toContain(`${fmt(p.limits.devices)} devices`);
      for (const m of h.matchAll(/(\d[\d,]*) (tenants?|catalog apps|Custom Apps)/g)) {
        const n = Number(m[1]!.replace(/,/g, ""));
        const key = m[2]!.startsWith("tenant") ? "tenants" : m[2] === "catalog apps" ? "catalog_apps" : "custom_apps";
        expect(n, `${p.id} ${m[0]}`).toBe(p.limits[key]);
      }
      if (/Unlimited tenants/.test(h)) expect(p.limits.tenants).toBe(UNLIMITED);
      if (/Full catalog/.test(h)) expect(p.limits.catalog_apps).toBe(UNLIMITED);
    }
  });
});

describe("billing path end to end (Stripe stand-in, no card entry)", () => {
  const NOW = 1_800_000_000_000;
  let db: Db;
  let f: ReturnType<typeof fakeStripe>;
  beforeEach(() => {
    db = createMemoryDb("dockcrate");
    f = fakeStripe();
    clearPriceCache();
  });
  const hook = (body: string) => handleStripeWebhook(body, "good", { stripe: f.stripe, db, secret: "whsec_x", now: () => NOW });
  const addTenants = async (n: number) => {
    for (let i = 0; i < n; i++) await db.collection<Tenant>("tenants").put({ id: `t${i}`, orgId: "org_1", name: `Client ${i}`, status: "connected", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" } as unknown as Tenant);
  };

  it("choose a plan -> Checkout Session -> webhook lifts the limits -> portal -> cancel falls back to Free limits", async () => {
    const at = new Date(NOW);
    await addTenants(1);
    await expect(assertCanAddTenant(db, "org_1", at)).rejects.toMatchObject({ status: 402, code: "limit_reached" });

    // 1. Plan selection creates the right Checkout Session.
    const urls = checkoutReturnUrls("https://dockcrate.buffersoltech.com/");
    expect(urls).toEqual({ success: "https://dockcrate.buffersoltech.com/app/billing?checkout=success", cancel: "https://dockcrate.buffersoltech.com/app/billing?checkout=canceled" });
    const r = await createCheckoutSession(f.stripe, db, { orgId: "org_1", email: "mike@buckeye.test", userId: "u_1" }, "professional", "month", urls);
    expect(r.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const call = f.calls.find((c) => c.method === "checkout.sessions.create")!.args as Record<string, any>;
    const priceId = call.line_items[0].price as string;
    const { data } = await f.stripe.prices.list({ lookup_keys: [planById("professional")!.prices.find((p) => p.interval === "month")!.lookupKey] });
    expect(data[0]!.id).toBe(priceId);
    expect(data[0]!.lookup_key).toBe("dockcrate_professional_monthly");
    expect(call.metadata).toMatchObject({ app: "dockcrate", plan: "professional", interval: "month", org_id: "org_1" });
    expect(call.subscription_data.metadata.app).toBe("dockcrate");
    expect(call.success_url).toBe(`${urls.success}&session_id={CHECKOUT_SESSION_ID}`);
    expect(call.cancel_url).toBe(urls.cancel);
    const cus = (await db.getBillingAccount("org_1"))!.stripeCustomerId!;
    expect(f.customers.get(cus)!.metadata.app).toBe("dockcrate");

    // 2. The webhook activates the plan and its limits.
    const sub = f.addSub(cus, "dockcrate_professional_monthly");
    expect((await hook(event("checkout.session.completed", { customer: cus }))).status).toBe(200);
    let l = await orgLimits(db, "org_1", at);
    expect(l.plan.id).toBe("professional");
    expect(l.tenants.limit).toBe(UNLIMITED);
    expect(l.devices.limit).toBe(1000);
    await expect(assertCanAddTenant(db, "org_1", at)).resolves.toBeUndefined();
    await addTenants(3);

    // 3. The portal opens for this customer.
    expect((await createPortalSession(f.stripe, db, "org_1", "https://dockcrate.buffersoltech.com/app/billing")).url).toBe(`https://billing.stripe.test/${cus}`);

    // 4. Cancel at period end keeps the plan; the subscription ending downgrades to Free limits.
    sub.cancel_at_period_end = true;
    await hook(event("customer.subscription.updated", { customer: cus }));
    expect((await db.getEntitlement("org_1"))?.cancelAtPeriodEnd).toBe(true);
    expect((await orgLimits(db, "org_1", at)).plan.id).toBe("professional");
    sub.status = "canceled";
    await hook(event("customer.subscription.deleted", { customer: cus }));
    l = await orgLimits(db, "org_1", at);
    expect(l.plan.id).toBe("free");
    await expect(assertCanAddTenant(db, "org_1", at)).rejects.toMatchObject({ status: 402 });
    // Data is kept, and the over-limit state is now visible app-wide.
    expect(l.tenants.used).toBe(3);
    expect(bannerMeter(limitStates(l))?.meter).toBe("tenants");
  });
});
