import { audit } from "@/lib/audit";
import type { CatalogApp } from "@/lib/catalog/types";
import type { Deps } from "@/lib/deps";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { setAutoUpdate } from "@/lib/rings/engine";
import type { RingConfig } from "@/lib/rings/types";
import { publishVersion, type PublishCtx } from "@/lib/publish/win32";
import { getTenant, type Tenant } from "@/lib/tenants";

export const APP_SET_CONCURRENCY = 3;
export const MAX_APPS_PER_SET = 50;
export const MAX_TENANTS_PER_RUN = 100;

/** A named list of apps with ring defaults, fanned out to tenants. */
export interface AppSet {
  id: string;
  orgId: string;
  name: string;
  appSlugs: string[];
  /** Ring defaults applied to every app of the set in every tenant it runs against. */
  intent: RingConfig["intent"];
  autoUpdate: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TenantRunStatus = "queued" | "running" | "succeeded" | "failed";
export interface AppResult { slug: string; status: "published" | "error"; detail?: string }
export interface TenantRunResult {
  tenantId: string;
  tenantName: string;
  status: TenantRunStatus;
  apps: AppResult[];
  attempts: number;
  error?: string;
}
export interface AppSetRun {
  id: string;
  orgId: string;
  appSetId: string;
  appSetName: string;
  status: "running" | "completed";
  results: TenantRunResult[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const runCounts = (r: Pick<AppSetRun, "results">) => ({
  total: r.results.length,
  succeeded: r.results.filter((x) => x.status === "succeeded").length,
  failed: r.results.filter((x) => x.status === "failed").length,
  pending: r.results.filter((x) => x.status === "queued" || x.status === "running").length,
});

export interface AppSetInput { name: string; appSlugs: string[]; intent?: RingConfig["intent"]; autoUpdate?: boolean }

async function validate(deps: Deps, input: AppSetInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, "invalid_name", "Name the App Set with 2 to 80 characters.");
  const slugs = [...new Set(input.appSlugs)];
  if (slugs.length === 0) throw new HttpError(400, "invalid_apps", "Pick at least one app.");
  if (slugs.length > MAX_APPS_PER_SET) throw new HttpError(400, "invalid_apps", `An App Set holds at most ${MAX_APPS_PER_SET} apps.`);
  const known = new Set((await deps.db.collection<CatalogApp>("catalog").find()).map((a) => a.slug));
  const missing = slugs.filter((s) => !known.has(s));
  if (missing.length) throw new HttpError(400, "invalid_apps", `Unknown app: ${missing[0]}.`);
  return { name, slugs };
}

export async function saveAppSet(deps: Deps, input: AppSetInput & { orgId: string; id?: string; actorId: string | null }): Promise<AppSet> {
  const { name, slugs } = await validate(deps, input);
  const col = deps.db.collection<AppSet>("app_sets");
  const cur = input.id ? await col.get(input.id) : null;
  if (input.id && (!cur || cur.orgId !== input.orgId)) throw new HttpError(404, "app_set_not_found");
  const now = deps.now().toISOString();
  const set: AppSet = { id: cur?.id ?? uuidv7(), orgId: input.orgId, name, appSlugs: slugs, intent: input.intent ?? "required", autoUpdate: input.autoUpdate ?? true, createdAt: cur?.createdAt ?? now, updatedAt: now };
  await col.put(set);
  await audit({ orgId: input.orgId, actorId: input.actorId, action: cur ? "app_set.updated" : "app_set.created", target: set.id, meta: { name, apps: slugs.length } });
  return set;
}

export async function deleteAppSet(deps: Deps, orgId: string, id: string, actorId: string | null) {
  const col = deps.db.collection<AppSet>("app_sets");
  const cur = await col.get(id);
  if (!cur || cur.orgId !== orgId) throw new HttpError(404, "app_set_not_found");
  await col.delete(id);
  await audit({ orgId, actorId, action: "app_set.deleted", target: id, meta: { name: cur.name } });
}

/** Runs `fn` over `items` with at most `limit` in flight. Never rejects: `fn` must catch its own errors. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  }));
}

/** Creates the run with every tenant queued. Nothing is published until `executeRun`. */
export async function createRun(deps: Deps, input: { orgId: string; appSetId: string; tenantIds: string[]; actorId: string | null }): Promise<AppSetRun> {
  const set = await deps.db.collection<AppSet>("app_sets").get(input.appSetId);
  if (!set || set.orgId !== input.orgId) throw new HttpError(404, "app_set_not_found");
  const ids = [...new Set(input.tenantIds)];
  if (ids.length === 0) throw new HttpError(400, "invalid_tenants", "Pick at least one tenant.");
  if (ids.length > MAX_TENANTS_PER_RUN) throw new HttpError(400, "invalid_tenants", `A run covers at most ${MAX_TENANTS_PER_RUN} tenants.`);
  const tenants: Tenant[] = [];
  for (const id of ids) tenants.push(await getTenant(deps, input.orgId, id));
  const now = deps.now().toISOString();
  const run: AppSetRun = {
    id: uuidv7(), orgId: input.orgId, appSetId: set.id, appSetName: set.name, status: "running", createdBy: input.actorId, createdAt: now, updatedAt: now,
    results: tenants.map((t) => ({ tenantId: t.id, tenantName: t.name, status: "queued", apps: [], attempts: 0 })),
  };
  await deps.db.collection<AppSetRun>("app_set_runs").put(run);
  await audit({ orgId: input.orgId, actorId: input.actorId, action: "app_set.run_started", target: run.id, meta: { appSet: set.name, tenants: tenants.length } });
  return run;
}

export type Guard = (tenantId: string, appSlug: string) => Promise<void>;

async function runTenant(deps: Deps, ctx: PublishCtx, set: AppSet, r: TenantRunResult, orgId: string, actorId: string | null, guard?: Guard): Promise<TenantRunResult> {
  const apps: AppResult[] = [];
  let error: string | undefined;
  for (const slug of set.appSlugs) {
    try {
      const app = await deps.db.collection<CatalogApp>("catalog").get(slug);
      if (!app) throw new HttpError(404, "app_not_found");
      await guard?.(r.tenantId, slug);
      await publishVersion(deps, ctx, { orgId, tenantId: r.tenantId, versionId: app.currentVersionId, actorId, intent: set.intent });
      await setAutoUpdate(deps, { orgId, tenantId: r.tenantId, appSlug: slug, autoUpdate: set.autoUpdate, actorId });
      apps.push({ slug, status: "published" });
    } catch (e) {
      const code = e instanceof HttpError ? e.code : (e as Error).message;
      const detail = e instanceof HttpError && typeof e.details === "string" ? e.details : code;
      apps.push({ slug, status: "error", detail });
      error ??= `${slug}: ${detail}`;
      // A tenant level problem (revoked, paused, no rings, over the limit) fails the rest the same way: stop early.
      if (e instanceof HttpError && ["tenant_not_connected", "tenant_paused", "rings_not_configured", "device_grace_ended"].includes(e.code)) {
        for (const rest of set.appSlugs.slice(apps.length)) apps.push({ slug: rest, status: "error", detail: code });
        break;
      }
    }
  }
  return { ...r, apps, attempts: r.attempts + 1, status: error ? "failed" : "succeeded", error };
}

/**
 * Executes the queued and failed tenants of a run, `APP_SET_CONCURRENCY` at a time. The run record is saved after each
 * tenant so a progress view sees results arrive. Publishing is idempotent per tenant + version, so a retry only does
 * the work that is missing.
 */
export async function executeRun(deps: Deps, ctx: PublishCtx, runId: string, opts: { only?: string[]; guard?: Guard; actorId?: string | null } = {}): Promise<AppSetRun> {
  const col = deps.db.collection<AppSetRun>("app_set_runs");
  const first = await col.get(runId);
  if (!first) throw new HttpError(404, "run_not_found");
  const set = await deps.db.collection<AppSet>("app_sets").get(first.appSetId);
  if (!set) throw new HttpError(404, "app_set_not_found");
  let run = first;
  const todo = run.results.filter((r) => (opts.only ? opts.only.includes(r.tenantId) : r.status === "queued"));
  const patch = async (tenantId: string, next: TenantRunResult) => {
    // Workers share this in-memory run; there is no await between the update and the put, so results never overwrite each other.
    run = { ...run, results: run.results.map((x) => (x.tenantId === tenantId ? next : x)), updatedAt: deps.now().toISOString() };
    await col.put(run);
  };
  await pool(todo, APP_SET_CONCURRENCY, async (r) => {
    await patch(r.tenantId, { ...r, status: "running" });
    let done: TenantRunResult;
    try { done = await runTenant(deps, ctx, set, r, run.orgId, opts.actorId ?? run.createdBy, opts.guard); }
    catch (e) { done = { ...r, status: "failed", attempts: r.attempts + 1, error: (e as Error).message }; }
    await patch(r.tenantId, done);
  });
  const finished = { ...run, status: "completed" as const, updatedAt: deps.now().toISOString() };
  await col.put(finished);
  const c = runCounts(finished);
  await audit({ orgId: run.orgId, actorId: opts.actorId ?? run.createdBy, action: "app_set.run_finished", target: run.id, meta: { appSet: run.appSetName, succeeded: c.succeeded, failed: c.failed } });
  return finished;
}

/** Marks the failed tenants of a finished run queued again. Returns the saved run and the tenants to execute. */
export async function queueRetry(deps: Deps, input: { orgId: string; runId: string; actorId: string | null }): Promise<{ run: AppSetRun; failed: string[] }> {
  const col = deps.db.collection<AppSetRun>("app_set_runs");
  const run = await col.get(input.runId);
  if (!run || run.orgId !== input.orgId) throw new HttpError(404, "run_not_found");
  if (run.status === "running") throw new HttpError(409, "run_in_progress");
  const failed = run.results.filter((r) => r.status === "failed").map((r) => r.tenantId);
  if (failed.length === 0) throw new HttpError(409, "nothing_to_retry", "No tenant failed in this run.");
  const queued: AppSetRun = { ...run, status: "running", updatedAt: deps.now().toISOString(), results: run.results.map((r) => (r.status === "failed" ? { ...r, status: "queued" as const } : r)) };
  await col.put(queued);
  await audit({ orgId: input.orgId, actorId: input.actorId, action: "app_set.retry", target: run.id, meta: { tenants: failed.length } });
  return { run: queued, failed };
}

/** Retries only the failed tenants of a finished run. */
export async function retryFailed(deps: Deps, ctx: PublishCtx, input: { orgId: string; runId: string; actorId: string | null; guard?: Guard }): Promise<AppSetRun> {
  const { failed } = await queueRetry(deps, input);
  return executeRun(deps, ctx, input.runId, { only: failed, guard: input.guard, actorId: input.actorId });
}
