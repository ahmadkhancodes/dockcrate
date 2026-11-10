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
import { publishReconcile } from "@/lib/publish/reconcile";
import { fanout, ringTick } from "@/lib/rings/engine";
import { tenantVerifyJob } from "@/lib/tenants";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  heartbeat: async () => ({ at: new Date().toISOString() }),
  /** Daily: one email per user who chose the digest, with the info and warning alerts since the last one. */
  "alert-digest": async () => alertDigestJob(await defaultDeps()),
  /** Part of the daily run: finish or remove uploads a crash left half done (adopts an Intune app that was created but never recorded). */
  "publish-reconcile": async () => publishReconcile(await defaultDeps(), defaultPublishCtx()),
  "tenant-verify": async () => tenantVerifyJob(await defaultDeps()),
  /** Nightly: count managed devices per tenant and org, start or clear the over-limit grace clock. */
  "device-count": async () => { const deps = await defaultDeps(); return deviceCountJob(deps, new InstallDataDeviceCounter(deps)); },
  /** Nightly: run every catalog app through winget, download, scan and verify. Fakes only for now, so nothing is persisted. */
  "catalog-sync": async () => {
    const deps = await defaultDeps();
    const signer = envManifestSigner();
    return catalogSync(deps.db, { ...(await fakePipeline(deps.db, signer, new PendingVmLab(), deps.now())), onSignerChange: (slug, version) => raiseSignerChanged(deps, slug, version) });
  },
  /** Part of the daily run (every minute once a faster scheduler exists, see CADENCE_MODE): fan new publishable versions out to tenants with auto update on, then promote or pause Pilot deployments. */
  "rings-tick": async () => {
    const deps = await defaultDeps();
    await ensureCatalogSeeded(deps.db);
    const ctx = defaultPublishCtx();
    const fanned: Record<string, unknown> = {};
    for (const app of await deps.db.collection<CatalogApp>("catalog").find()) fanned[app.slug] = (await fanout(deps, ctx, app.currentVersionId)).length;
    return { fanout: fanned, tick: await ringTick(deps) };
  },
};

/** Jobs the single daily run executes, in order. Vercel Hobby allows one run a day per entry, so one entry loops over all of them. */
export const DAILY_SEQUENCE = ["publish-reconcile", "tenant-verify", "rings-tick", "webhook-retries", "catalog-sync", "device-count"] as const;
const DAILY_BUDGET_MS = 50_000;

/** Runs every background job in turn until the time budget (inside the 60 s function limit) is spent. A failing job does not stop the rest. */
export async function dailyRun(budgetMs = DAILY_BUDGET_MS, now: () => number = Date.now): Promise<Record<string, unknown>> {
  const started = now();
  const out: Record<string, unknown> = {};
  for (const name of DAILY_SEQUENCE) {
    if (now() - started >= budgetMs) { out[name] = { skipped: "time_budget" }; continue; }
    try { out[name] = await cronJobs[name]!(); } catch (e) { out[name] = { error: (e as Error).message }; }
  }
  return out;
}
cronJobs.daily = () => dailyRun();
