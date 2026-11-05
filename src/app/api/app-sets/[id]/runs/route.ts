import { after } from "next/server";
import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { createRun, executeRun } from "@/lib/appsets";
import { authorize } from "@/lib/authz";
import { assertCanPublish } from "@/lib/billing/limits";
import { requirePlan } from "@/lib/billing/entitlement";
import { json, readJson, withApi } from "@/lib/http";
import { defaultPublishCtx } from "@/lib/publish/ctx";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Start an App Set run against the chosen tenants. Responds at once; the run executes after the response and the progress view polls it. */
export const POST = withApi(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { org, membership, deps } = await apiCtx();
  const { tenantIds } = await readJson(req, z.object({ tenantIds: z.array(z.string().min(1)).min(1).max(100) }));
  requirePlan(await deps.db.getEntitlement(org.org.id), "professional", deps.now().getTime());
  for (const t of tenantIds) authorize(membership, "deployment", "publish", t);
  const run = await createRun(deps, { orgId: org.org.id, appSetId: id, tenantIds, actorId: org.user.id });
  const guard = (_tenantId: string, slug: string) => assertCanPublish(deps.db, org.org.id, slug, deps.now());
  after(() => executeRun(deps, defaultPublishCtx(), run.id, { guard, actorId: org.user.id }).then(() => undefined, () => undefined));
  return json({ run }, 202);
});
