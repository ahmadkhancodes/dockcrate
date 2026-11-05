import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { saveAppSet, type AppSet, type AppSetRun } from "@/lib/appsets";
import { authorize } from "@/lib/authz";
import { requirePlan } from "@/lib/billing/entitlement";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";

export const GET = withApi(async () => {
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "deployment", "read");
  const [sets, runs] = await Promise.all([deps.db.collection<AppSet>("app_sets").find({ orgId: org.org.id }), deps.db.collection<AppSetRun>("app_set_runs").find({ orgId: org.org.id })]);
  return json({ sets, runs: runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20) });
});

const body = z.object({ id: z.string().optional(), name: z.string(), appSlugs: z.array(z.string()).max(200), intent: z.enum(["required", "available"]).optional(), autoUpdate: z.boolean().optional() });

/** Create or (with `id`) update an App Set. Professional and above. */
export const POST = withApi(async (req) => {
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "deployment", "publish");
  requirePlan(await deps.db.getEntitlement(org.org.id), "professional", deps.now().getTime());
  const b = await readJson(req, body);
  return json({ set: await saveAppSet(deps, { ...b, orgId: org.org.id, actorId: org.user.id }) }, b.id ? 200 : 201);
});
