import { alertDigestJob, raiseSignerChanged } from "@/lib/alerts";
import { ensureCatalogSeeded } from "@/lib/catalog";
import type { CatalogApp } from "@/lib/catalog/types";
import { InstallDataDeviceCounter } from "@/lib/billing/devices";
import { deviceCountJob } from "@/lib/billing/limits";
import { envManifestSigner } from "@/lib/catalog/manifest";
import { catalogSync, fakePipeline } from "@/lib/catalog/sync";
import { PendingVmLab } from "@/lib/catalog/vmlab";
import { defaultDeps } from "@/lib/deps";
import { defaultPublishCtx } from "@/lib/publish/ctx";
import { fanout, ringTick } from "@/lib/rings/engine";
import { tenantVerifyJob } from "@/lib/tenants";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  heartbeat: async () => ({ at: new Date().toISOString() }),
  /** Daily: one email per user who chose the digest, with the info and warning alerts since the last one. */
  "alert-digest": async () => alertDigestJob(await defaultDeps()),
  "tenant-verify": async () => tenantVerifyJob(await defaultDeps()),
  /** Nightly: count managed devices per tenant and org, start or clear the over-limit grace clock. */
  "device-count": async () => { const deps = await defaultDeps(); return deviceCountJob(deps, new InstallDataDeviceCounter(deps)); },
  /** Nightly: run every catalog app through winget, download, scan and verify. Fakes only for now, so nothing is persisted. */
  "catalog-sync": async () => {
    const deps = await defaultDeps();
    const signer = envManifestSigner();
    return catalogSync(deps.db, { ...(await fakePipeline(deps.db, signer, new PendingVmLab(), deps.now())), onSignerChange: (slug, version) => raiseSignerChanged(deps, slug, version) });
  },
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
