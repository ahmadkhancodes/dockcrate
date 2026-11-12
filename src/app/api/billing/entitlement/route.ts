import { product } from "@/config/product";
import { requireOrg } from "@/lib/auth/session";
import { computeEntitlement, effectivePlan } from "@/lib/billing/entitlement";
import { getStripe } from "@/lib/billing/stripe";
import { limitStates, orgLimits } from "@/lib/billing/limits";
import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";
import { rateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?refresh=1 asks Stripe directly so a plan unlocks right after checkout without waiting for the webhook (C-13). */
export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  const db = await getDb();
  let ent = await db.getEntitlement(ctx.org.id);
  const stripe = getStripe();
  // Each refresh is a Stripe API call; over the cap the stored entitlement is served instead (S-6).
  if (new URL(req.url).searchParams.get("refresh") === "1" && stripe && (await rateLimit(`ent-refresh:${ctx.org.id}`, RULES.outbound, db)).ok) {
    const acct = await db.getBillingAccount(ctx.org.id);
    if (acct?.stripeCustomerId) {
      ent = await computeEntitlement(stripe, db.app, acct.stripeCustomerId, ent, Date.now());
      await db.setEntitlement(ctx.org.id, ent);
    }
  }
  const plan = effectivePlan(ent);
  const limits = await orgLimits(db, ctx.org.id);
  return json({ plan: { id: plan.id, name: plan.name }, entitlement: ent, usage: limitStates(limits), graceEndsAt: limits.graceEndsAt, currency: product.currency });
});
