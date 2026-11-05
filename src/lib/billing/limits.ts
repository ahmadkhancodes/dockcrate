import { product, type Plan } from "@/config/product";
import type { Db } from "@/lib/db/types";
import type { Deps } from "@/lib/deps";
import { raiseAlert } from "@/lib/alerts";
import { HttpError } from "@/lib/http";
import type { TenantApp } from "@/lib/rings/types";
import type { Tenant } from "@/lib/tenants";
import type { DeviceCount, DeviceCounter, OrgBilling } from "./devices";
import { effectivePlan } from "./entitlement";
import { usageState, type UsageState } from "./usage";

const DAY = 86_400_000;
/** The "grace ending" alert goes out this many days before publishing stops. */
export const GRACE_WARN_DAYS = 3;

export interface OrgLimits {
  plan: Plan;
  devices: UsageState;
  tenants: UsageState;
  apps: UsageState;
  /** First night the managed devices went over the plan limit (null when within it). */
  overSince: string | null;
  /** End of the D-04 grace period (14 days) while over the device limit. */
  graceEndsAt: string | null;
  graceExpired: boolean;
}

export async function orgDeviceTotal(db: Db, orgId: string): Promise<number> {
  const tenants = new Set((await db.collection<Tenant>("tenants").find({ orgId })).map((t) => t.id));
  return (await db.collection<DeviceCount>("device_counts").find({ orgId })).filter((c) => tenants.has(c.id)).reduce((n, c) => n + c.count, 0);
}

/** Usage against the effective plan. Live: an upgrade lifts the block at once, a downgrade applies at the next read. */
export async function orgLimits(db: Db, orgId: string, now = new Date()): Promise<OrgLimits> {
  const plan = effectivePlan(await db.getEntitlement(orgId), now.getTime());
  const [deviceTotal, tenants, tas, billing] = await Promise.all([
    orgDeviceTotal(db, orgId),
    db.collection<Tenant>("tenants").find({ orgId }),
    db.collection<TenantApp>("tenant_apps").find({ orgId }),
    db.collection<OrgBilling>("org_billing").get(orgId),
  ]);
  const devices = usageState("devices", deviceTotal, plan.limits.devices);
  const over = deviceTotal > plan.limits.devices;
  const overSince = over ? billing?.overSince ?? now.toISOString() : null;
  const graceEnd = overSince ? new Date(overSince).getTime() + product.graceDays * DAY : null;
  return {
    plan, devices,
    tenants: usageState("tenants", tenants.length, plan.limits.tenants),
    apps: usageState("catalog_apps", new Set(tas.map((a) => a.appSlug)).size, plan.limits.catalog_apps),
    overSince, graceEndsAt: graceEnd ? new Date(graceEnd).toISOString() : null, graceExpired: graceEnd !== null && now.getTime() >= graceEnd,
  };
}

export const limitStates = (l: OrgLimits): UsageState[] => [l.devices, l.tenants, l.apps];

const upgrade = (plan: Plan, what: string) => new HttpError(402, "limit_reached", `Your ${plan.name} plan includes ${what}. Upgrade to add more.`);

/** Throws 402 when one more tenant would exceed the plan. */
export async function assertCanAddTenant(db: Db, orgId: string, now = new Date()) {
  const l = await orgLimits(db, orgId, now);
  if (l.tenants.used >= l.tenants.limit) throw upgrade(l.plan, `${l.tenants.limit} tenant${l.tenants.limit === 1 ? "" : "s"}`);
}

/** Throws 402 when publishing is blocked: device grace ended, or a new app would exceed the plan's app limit. */
export async function assertCanPublish(db: Db, orgId: string, appSlug: string, now = new Date()) {
  const l = await orgLimits(db, orgId, now);
  if (l.graceExpired) throw new HttpError(402, "device_grace_ended", `Your managed devices are over the ${l.plan.name} limit of ${l.devices.limit} and the ${product.graceDays} day grace period has ended. Upgrade to publish again.`);
  const known = (await db.collection<TenantApp>("tenant_apps").find({ orgId })).some((a) => a.appSlug === appSlug);
  if (!known && l.apps.used >= l.apps.limit) throw upgrade(l.plan, `${l.apps.limit} catalog apps`);
}

export interface DeviceCountResult { tenants: number; failed: number; orgs: number; overLimit: number }

/** Cron `device-count` (nightly). Failed tenants keep their last count. Starts or clears each org's grace clock. */
export async function deviceCountJob(deps: Deps, counter: DeviceCounter): Promise<DeviceCountResult> {
  const out: DeviceCountResult = { tenants: 0, failed: 0, orgs: 0, overLimit: 0 };
  const at = deps.now();
  const tenants = (await deps.db.collection<Tenant>("tenants").find()).filter((t) => t.status === "connected");
  for (const t of tenants) {
    try {
      await deps.db.collection<DeviceCount>("device_counts").put({ id: t.id, orgId: t.orgId, count: await counter.count(t), countedAt: at.toISOString() });
      out.tenants++;
    } catch {
      out.failed++;
    }
  }
  for (const orgId of new Set((await deps.db.collection<Tenant>("tenants").find()).map((t) => t.orgId))) {
    out.orgs++;
    const prev = await deps.db.collection<OrgBilling>("org_billing").get(orgId);
    const l = await orgLimits(deps.db, orgId, at);
    // orgLimits reports "now" for an org that just went over; keep the first night once set.
    const overSince = l.overSince ? prev?.overSince ?? l.overSince : null;
    if (overSince) out.overLimit++;
    if ((prev?.overSince ?? null) !== overSince) await deps.db.collection<OrgBilling>("org_billing").put({ id: orgId, overSince });
    if (overSince) {
      const end = new Date(overSince).getTime() + product.graceDays * DAY;
      const left = end - at.getTime();
      if (left <= GRACE_WARN_DAYS * DAY) {
        const ended = left <= 0;
        await raiseAlert(deps, { orgId, tenantId: null, severity: "critical", kind: "device.grace_ending", dedupeKey: `grace:${orgId}:${overSince}:${ended ? "ended" : "ending"}`,
          message: ended ? `Your managed devices are over the ${l.plan.name} limit and the ${product.graceDays} day grace period has ended. Publishing is stopped until you upgrade.` : `Your managed devices are over the ${l.plan.name} limit. Publishing stops in ${Math.max(1, Math.ceil(left / DAY))} day${left > DAY ? "s" : ""} unless you upgrade or remove devices.` });
      }
    }
  }
  return out;
}
