import { after } from "next/server";
import { apiCtx } from "@/lib/api/ctx";
import { executeRun, queueRetry, runCounts, type AppSetRun } from "@/lib/appsets";
import { authorize, inScope } from "@/lib/authz";
import { assertCanPublish } from "@/lib/billing/limits";
import { HttpError, json, withApi } from "@/lib/http";
import { defaultPublishCtx } from "@/lib/publish/ctx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function load(id: string) {
  const c = await apiCtx();
  authorize(c.membership, "deployment", "read");
  const run = await c.deps.db.collection<AppSetRun>("app_set_runs").get(id);
  if (!run || run.orgId !== c.org.org.id) throw new HttpError(404, "run_not_found");
  return { ...c, run };
}

/** Progress: only the tenants the caller may see. */
export const GET = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { membership, run } = await load((await params).id);
  const visible = { ...run, results: run.results.filter((r) => inScope(membership, r.tenantId)) };
  return json({ run: visible, counts: runCounts(visible) });
});

/** Retry the failed tenants of a finished run. */
export const POST = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { org, membership, deps, run } = await load((await params).id);
  for (const r of run.results.filter((x) => x.status === "failed")) authorize(membership, "deployment", "publish", r.tenantId);
  const guard = (_t: string, slug: string) => assertCanPublish(deps.db, org.org.id, slug, deps.now());
  const { run: queued, failed } = await queueRetry(deps, { orgId: org.org.id, runId: run.id, actorId: org.user.id });
  after(() => executeRun(deps, defaultPublishCtx(), run.id, { only: failed, guard, actorId: org.user.id }).then(() => undefined, () => undefined));
  return json({ run: queued }, 202);
});
