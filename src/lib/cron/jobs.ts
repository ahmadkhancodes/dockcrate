import { ensureCatalogSeeded } from "@/lib/catalog";
import type { CatalogApp } from "@/lib/catalog/types";
import { defaultDeps } from "@/lib/deps";
import { defaultPublishCtx } from "@/lib/publish/ctx";
import { fanout, ringTick } from "@/lib/rings/engine";
import { tenantVerifyJob } from "@/lib/tenants";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  heartbeat: async () => ({ at: new Date().toISOString() }),
  "tenant-verify": async () => tenantVerifyJob(await defaultDeps()),
  /** Every minute: fan new publishable versions out to tenants with auto update on, then promote or pause Pilot deployments. */
  "rings-tick": async () => {
    const deps = await defaultDeps();
    await ensureCatalogSeeded(deps.db);
    const ctx = defaultPublishCtx();
    const fanned: Record<string, unknown> = {};
    for (const app of await deps.db.collection<CatalogApp>("catalog").find()) fanned[app.slug] = (await fanout(deps, ctx, app.currentVersionId)).length;
    return { fanout: fanned, tick: await ringTick(deps) };
  },
};
