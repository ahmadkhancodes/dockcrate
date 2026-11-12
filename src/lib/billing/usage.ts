import type { MeterId } from "@/config/product";
import type { Db } from "@/lib/db/types";
import { effectivePlan, limitFor } from "./entitlement";

// Metering hooks (MAU, mailboxes, devices...). Period = calendar month UTC.
export const periodOf = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export interface UsageState {
  meter: MeterId;
  used: number;
  limit: number;
  ratio: number;
  /** "ok" < 80%, "near" 80-99%, "over" >= 100% */
  level: "ok" | "near" | "over";
}

export function usageState(meter: MeterId, used: number, limit: number): UsageState {
  const ratio = limit <= 0 ? (used > 0 ? 1 : 0) : used / limit;
  return { meter, used, limit, ratio, level: ratio >= 1 ? "over" : ratio >= 0.8 ? "near" : "ok" };
}

/** Count one unit and report whether it is within the plan (soft cap: caller decides to hold, never drop). */
export async function meter(db: Db, orgId: string, m: MeterId, by = 1, now = new Date()): Promise<UsageState & { within: boolean }> {
  const ent = await db.getEntitlement(orgId);
  const used = await db.incUsage(orgId, m, periodOf(now), by);
  const limit = limitFor(ent, m, now.getTime());
  return { ...usageState(m, used, limit), within: used <= limit };
}

export async function currentUsage(db: Db, orgId: string, meters: MeterId[], now = new Date()): Promise<UsageState[]> {
  const ent = await db.getEntitlement(orgId);
  const plan = effectivePlan(ent, now.getTime());
  return Promise.all(meters.map(async (m) => usageState(m, await db.getUsage(orgId, m, periodOf(now)), plan.limits[m])));
}

/**
 * The meter the app-wide banner should talk about, or null. Devices are the billed meter, so they warn from 80% (brief:
 * banners at 80% and 100%). Tenants and catalog apps are allowances: using all of them (a Free org with its one tenant)
 * is normal, so the banner only appears when they are over (for example after a downgrade). The tenants page and the
 * 402 answer explain the cap at the moment someone tries to add one more.
 */
export function bannerMeter(usage: UsageState[]): UsageState | null {
  const show = usage.filter((u) => (u.meter === "devices" ? u.level !== "ok" : u.used > u.limit));
  return show.sort((a, b) => b.ratio - a.ratio)[0] ?? null;
}
