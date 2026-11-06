import { audit } from "@/lib/audit";
import type { Deps } from "@/lib/deps";
import type { Deployment } from "@/lib/rings/types";
import type { Tenant } from "@/lib/tenants";
import { ensureCatalogSeeded } from "@/lib/catalog";
import type { CatalogApp, CatalogVersion } from "@/lib/catalog/types";
import { intuneName, publishVersion, type PublishCtx } from "./win32";

/** A stuck upload is left alone this long after its last write (longer than the 5 minute lease). */
export const RECONCILE_AFTER_MS = 10 * 60_000;
/** An upload that still has not finished after this long is abandoned: its Intune app is removed. */
export const ABANDON_AFTER_MS = 24 * 3_600_000;

export interface ReconcileResult { checked: number; adopted: number; finished: number; removed: number; failed: number }

/**
 * Cron `publish-reconcile`. Finds uploads that a crash or a timeout left half done and either finishes or removes them:
 * - A deployment with `createStartedAt` and no `intuneAppId` may own an Intune app we created but never recorded. The app is found
 *   by its exact name and adopted; if none exists, the create step is simply retried.
 * - A stuck upload younger than 24 h is resumed through `publishVersion` (the lease and the stored step make that safe).
 * - An older one is abandoned: the Intune app is deleted, the deployment becomes `failed`.
 * - Extra apps with the same name that no deployment records (a double create) are deleted.
 */
export async function publishReconcile(deps: Deps, ctx: PublishCtx): Promise<ReconcileResult> {
  const r: ReconcileResult = { checked: 0, adopted: 0, finished: 0, removed: 0, failed: 0 };
  const col = deps.db.collection<Deployment>("deployments");
  const nowMs = deps.now().getTime();
  const stuck = (await col.find({ state: "uploading" })).filter((d) =>
    (!d.leaseUntil || new Date(d.leaseUntil.split("|")[0]!).getTime() <= nowMs) && nowMs - new Date(d.updatedAt).getTime() >= RECONCILE_AFTER_MS);
  if (stuck.length) await ensureCatalogSeeded(deps.db, ctx.signer, deps.now());
  for (const d0 of stuck) {
    r.checked++;
    try {
      const tenant = await deps.db.collection<Tenant>("tenants").get(d0.tenantId);
      if (!tenant?.entraTenantId || tenant.status !== "connected") continue;
      const graph = deps.graph.forTenant(tenant.entraTenantId);
      const v = await deps.db.collection<CatalogVersion>("catalog_versions").get(d0.versionId);
      const app = v ? await deps.db.collection<CatalogApp>("catalog").get(v.appSlug) : null;
      let d = d0;
      if (v && app) {
        const name = intuneName(app, v);
        const all = await col.find({ tenantId: d.tenantId });
        const held = new Set(all.filter((x) => x.id !== d.id).map((x) => x.intuneAppId).filter(Boolean));
        const found = (await graph.findAppsByName(name)).filter((a) => !held.has(a.id));
        if (!d.intuneAppId && d.createStartedAt) {
          const mine = found[0];
          if (mine) {
            d = { ...d, intuneAppId: mine.id, step: "content_version", error: null, updatedAt: deps.now().toISOString() };
            await col.put(d);
            r.adopted++;
            await audit({ orgId: d.orgId, actorId: null, action: "deployment.orphan_adopted", target: d.id, meta: { tenantId: d.tenantId, app: d.appSlug, version: d.version } });
            found.shift();
          } else {
            // Nothing was created: retry the create step from a clean marker.
            d = { ...d, createStartedAt: null, step: "create_app", updatedAt: deps.now().toISOString() };
            await col.put(d);
          }
        } else if (d.intuneAppId) found.splice(found.findIndex((a) => a.id === d.intuneAppId), 1);
        // Whatever is left with our exact name and no record is a duplicate from a double create.
        if (d.intuneAppId || d.createStartedAt) for (const extra of found) {
          await graph.deleteApp(extra.id);
          r.removed++;
          await audit({ orgId: d.orgId, actorId: null, action: "deployment.orphan_removed", target: d.id, meta: { tenantId: d.tenantId, app: d.appSlug, version: d.version } });
        }
      }
      if (nowMs - new Date(d.createdAt).getTime() >= ABANDON_AFTER_MS || !v || !app) {
        if (d.intuneAppId) { await graph.deleteApp(d.intuneAppId); r.removed++; }
        await col.put({ ...d, state: "failed", intuneAppId: null, error: "abandoned_by_reconciler", leaseUntil: null, updatedAt: deps.now().toISOString() });
        await audit({ orgId: d.orgId, actorId: null, action: "deployment.abandoned", target: d.id, meta: { tenantId: d.tenantId, app: d.appSlug, version: d.version } });
        continue;
      }
      await publishVersion(deps, ctx, { orgId: d.orgId, tenantId: d.tenantId, versionId: d.versionId, actorId: null, variant: d.variant });
      r.finished++;
    } catch {
      r.failed++; // the next run tries again
    }
  }
  return r;
}
