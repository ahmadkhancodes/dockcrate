import { audit } from "@/lib/audit";
import { publishPlan } from "@/lib/catalog/verify";
import type { CatalogVersion } from "@/lib/catalog/types";
import type { Deps } from "@/lib/deps";
import { GraphConsentError, type GraphAssignment } from "@/lib/graph/types";
import { HttpError } from "@/lib/http";
import { noticeEmail } from "@/lib/mail/templates";
import { publishVersion, type PublishCtx } from "@/lib/publish/win32";
import { raiseAlert, type Tenant } from "@/lib/tenants";
import type { Deployment, OrgSettings, RingConfig, TenantApp } from "./types";
import { DEFAULT_BROAD_DELAY_HOURS, DEFAULT_FAIL_THRESHOLD_PCT, DEFAULT_PILOT_DELAY_HOURS } from "./types";

const HOUR = 3_600_000;

export function defaultRingConfig(tenant: Pick<Tenant, "id" | "orgId">, pilotGroup: { id: string; name: string }, broadGroup: { id: string; name: string }): RingConfig {
  return {
    id: tenant.id, orgId: tenant.orgId,
    pilot: { groupId: pilotGroup.id, groupName: pilotGroup.name, delayHours: DEFAULT_PILOT_DELAY_HOURS },
    broad: { groupId: broadGroup.id, groupName: broadGroup.name, delayHours: DEFAULT_BROAD_DELAY_HOURS },
    failThresholdPct: DEFAULT_FAIL_THRESHOLD_PCT, intent: "required", alertEmail: null,
  };
}

async function put(deps: Deps, d: Deployment, patch: Partial<Deployment>): Promise<Deployment> {
  const next = { ...d, ...patch, updatedAt: deps.now().toISOString() };
  await deps.db.collection<Deployment>("deployments").put(next);
  return next;
}

/** Pause scopes: one tenant, or the whole org. Ticks skip paused scopes. */
export async function setTenantPaused(deps: Deps, orgId: string, tenantId: string, paused: boolean, actorId: string | null) {
  const col = deps.db.collection<Tenant>("tenants");
  const t = await col.get(tenantId);
  if (!t || t.orgId !== orgId) throw new HttpError(404, "tenant_not_found");
  await col.put({ ...t, paused, updatedAt: deps.now().toISOString() });
  await audit({ orgId, actorId, action: paused ? "tenant.paused" : "tenant.resumed", target: tenantId, meta: { tenantId } });
}

export async function setOrgPaused(deps: Deps, orgId: string, paused: boolean, actorId: string | null) {
  await deps.db.collection<OrgSettings>("org_settings").put({ id: orgId, paused });
  await audit({ orgId, actorId, action: paused ? "org.paused" : "org.resumed", target: orgId });
}

export async function setAutoUpdate(deps: Deps, input: { orgId: string; tenantId: string; appSlug: string; autoUpdate: boolean; actorId: string | null }) {
  const col = deps.db.collection<TenantApp>("tenant_apps");
  const id = `${input.tenantId}:${input.appSlug}`;
  const now = deps.now().toISOString();
  const cur = await col.get(id);
  if (cur && cur.orgId !== input.orgId) throw new HttpError(404, "not_found");
  await col.put({ id, orgId: input.orgId, tenantId: input.tenantId, appSlug: input.appSlug, autoUpdate: input.autoUpdate, createdAt: cur?.createdAt ?? now, updatedAt: now });
  await audit({ orgId: input.orgId, actorId: input.actorId, action: "tenant_app.auto_update", target: id, meta: { tenantId: input.tenantId, app: input.appSlug, autoUpdate: input.autoUpdate } });
}

export interface TickResult { checked: number; promoted: number; paused: number; skipped: number; waitingForVm: number }

/**
 * Cron `rings-tick`. For each Pilot deployment: read install status; a failure rate at or over the threshold pauses it
 * (alert + audit); otherwise, once the Broad delay has elapsed AND the version may reach Broad (4/4 checks, D-01), assign Broad.
 * A deployment with no Pilot install data promotes after the delay (documented behaviour).
 */
export async function ringTick(deps: Deps): Promise<TickResult> {
  const out: TickResult = { checked: 0, promoted: 0, paused: 0, skipped: 0, waitingForVm: 0 };
  const now = deps.now().getTime();
  const open = await deps.db.collection<Deployment>("deployments").find({ state: "assigned" });
  for (const d of open) {
    const tenant = await deps.db.collection<Tenant>("tenants").get(d.tenantId);
    const orgPaused = (await deps.db.collection<OrgSettings>("org_settings").get(d.orgId))?.paused;
    const config = await deps.db.collection<RingConfig>("ring_configs").get(d.tenantId);
    if (!tenant || !config || !tenant.entraTenantId || tenant.status !== "connected" || tenant.paused || orgPaused || !d.intuneAppId || d.step !== "done") { out.skipped++; continue; }
    out.checked++;
    const graph = deps.graph.forTenant(tenant.entraTenantId);
    try {
      const s = await graph.getInstallSummary(d.intuneAppId);
      const total = s.installed + s.failed;
      const pct = total > 0 ? Math.round((s.failed / total) * 1000) / 10 : 0;
      if (total > 0 && pct >= config.failThresholdPct) {
        await put(deps, d, { state: "paused", failurePct: pct, pausedReason: `${pct}% of Pilot devices failed the install (threshold ${config.failThresholdPct}%).` });
        await raiseAlert(deps, { orgId: d.orgId, tenantId: d.tenantId, severity: "critical", kind: "ring.paused", message: `${d.appSlug} ${d.version} paused in ${tenant.name}: ${pct}% of Pilot devices failed (threshold ${config.failThresholdPct}%).` });
        await audit({ orgId: d.orgId, actorId: null, action: "deployment.paused", target: d.id, meta: { tenantId: d.tenantId, app: d.appSlug, version: d.version, failurePct: pct } });
        if (config.alertEmail) await deps.sendMail({ to: config.alertEmail, ...noticeEmail({ title: `Ring paused: ${d.appSlug} ${d.version}`, body: `${tenant.name}: ${pct}% of Pilot devices failed the install, over the ${config.failThresholdPct}% threshold. Broad is paused. Open the dock to roll back or review the log.`, actionUrl: `${deps.baseUrl}/app?tenant=${tenant.id}`, actionLabel: "Open the dock" }), category: "transactional" });
        out.paused++;
        continue;
      }
      if (d.pilotAssignedAt && now < new Date(d.pilotAssignedAt).getTime() + config.broad.delayHours * HOUR) { await put(deps, d, { failurePct: pct }); continue; }
      const v = await deps.db.collection<CatalogVersion>("catalog_versions").get(d.versionId);
      if (!v || !publishPlan(v).rings.includes("broad")) { out.waitingForVm++; await put(deps, d, { failurePct: pct }); continue; }
      const assignments: GraphAssignment[] = [...d.assignments, { groupId: config.broad.groupId, intent: config.intent }];
      await graph.assignApp(d.intuneAppId, assignments);
      await put(deps, d, { state: "promoted", assignments, broadAssignedAt: deps.now().toISOString(), failurePct: pct });
      await audit({ orgId: d.orgId, actorId: null, action: "deployment.promoted", target: d.id, meta: { tenantId: d.tenantId, app: d.appSlug, version: d.version, ring: "broad" } });
      out.promoted++;
    } catch (e) {
      if (e instanceof GraphConsentError) {
        await deps.db.collection<Tenant>("tenants").put({ ...tenant, status: "disconnected", lastError: "Consent was revoked.", updatedAt: deps.now().toISOString() });
        await raiseAlert(deps, { orgId: tenant.orgId, tenantId: tenant.id, severity: "critical", kind: "tenant.disconnected", message: `${tenant.name}: consent was revoked. Jobs for this tenant are stopped.` });
      }
      out.skipped++;
    }
  }
  return out;
}

/** Roll back to one of the last 3 earlier versions of the same app in the same tenant (default: the previous one). */
export async function rollback(deps: Deps, input: { orgId: string; deploymentId: string; toDeploymentId?: string; actorId: string | null }): Promise<{ from: Deployment; to: Deployment }> {
  const col = deps.db.collection<Deployment>("deployments");
  const cur = await col.get(input.deploymentId);
  if (!cur || cur.orgId !== input.orgId) throw new HttpError(404, "deployment_not_found");
  if (!["assigned", "promoted", "paused"].includes(cur.state) || !cur.intuneAppId) throw new HttpError(409, "not_rollbackable");
  const tenant = await deps.db.collection<Tenant>("tenants").get(cur.tenantId);
  if (!tenant?.entraTenantId || tenant.status !== "connected") throw new HttpError(409, "tenant_not_connected");

  const earlier = (await col.find({ tenantId: cur.tenantId, appSlug: cur.appSlug }))
    .filter((x) => x.id !== cur.id && x.createdAt < cur.createdAt && x.step === "done" && !!x.intuneAppId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  const target = input.toDeploymentId ? earlier.find((x) => x.id === input.toDeploymentId) : earlier[0];
  if (!target) throw new HttpError(409, "no_previous_version", "There is no earlier version in the last 3 to roll back to.");

  const graph = deps.graph.forTenant(tenant.entraTenantId);
  const groups = cur.assignments.map((a) => a.groupId);
  const intentOf = new Map(cur.assignments.map((a) => [a.groupId, a.intent]));
  // N goes back as Required (or what the ring used), N+1 as Uninstall, for the rings it had reached.
  const restore: GraphAssignment[] = groups.map((g) => ({ groupId: g, intent: intentOf.get(g) === "available" ? "available" : "required" }));
  const remove: GraphAssignment[] = groups.map((g) => ({ groupId: g, intent: "uninstall" }));
  await graph.assignApp(target.intuneAppId!, restore);
  await graph.assignApp(cur.intuneAppId, remove);

  const from = await put(deps, cur, { state: "rolled_back", pausedReason: null });
  const reachedBroad = !!cur.broadAssignedAt;
  const to = await put(deps, target, { state: reachedBroad ? "promoted" : "assigned", assignments: restore, broadAssignedAt: reachedBroad ? deps.now().toISOString() : target.broadAssignedAt });
  await audit({ orgId: input.orgId, actorId: input.actorId, action: "deployment.rolled_back", target: cur.id, meta: { tenantId: cur.tenantId, app: cur.appSlug, from: cur.version, to: target.version } });
  return { from, to };
}

export interface FanoutResult { tenantId: string; status: "published" | "skipped" | "error"; detail?: string }

/** A version became publishable: one Pilot deployment per tenant that has auto update on for the app. */
export async function fanout(deps: Deps, ctx: PublishCtx, versionId: string): Promise<FanoutResult[]> {
  const v = await deps.db.collection<CatalogVersion>("catalog_versions").get(versionId);
  if (!v || !publishPlan(v).allowed) return [];
  const orgPausedIds = new Set((await deps.db.collection<OrgSettings>("org_settings").find({ paused: true })).map((o) => o.id));
  const tas = await deps.db.collection<TenantApp>("tenant_apps").find({ appSlug: v.appSlug, autoUpdate: true });
  const results: FanoutResult[] = [];
  for (const ta of tas) {
    const t = await deps.db.collection<Tenant>("tenants").get(ta.tenantId);
    if (!t || t.status !== "connected" || t.paused || orgPausedIds.has(t.orgId)) { results.push({ tenantId: ta.tenantId, status: "skipped", detail: "tenant not connected or paused" }); continue; }
    try {
      await publishVersion(deps, ctx, { orgId: t.orgId, tenantId: t.id, versionId, actorId: null });
      results.push({ tenantId: t.id, status: "published" });
    } catch (e) {
      results.push({ tenantId: t.id, status: "error", detail: e instanceof HttpError ? e.code : (e as Error).message });
    }
  }
  return results;
}
