import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { authorize } from "@/lib/authz";
import type { Deployment } from "@/lib/rings/types";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { rollback } from "@/lib/rings/engine";

export const runtime = "nodejs";

export const POST = withApi(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { org, membership, deps } = await apiCtx();
  const d = await deps.db.collection<Deployment>("deployments").get(id);
  if (!d || d.orgId !== org.org.id) throw new HttpError(404, "deployment_not_found");
  authorize(membership, "deployment", "rollback", d.tenantId);
  const { toDeploymentId } = await readJson(req, z.object({ toDeploymentId: z.string().optional() }));
  const r = await rollback(deps, { orgId: org.org.id, deploymentId: id, toDeploymentId, actorId: org.user.id });
  return json({ from: { id: r.from.id, version: r.from.version, state: r.from.state }, to: { id: r.to.id, version: r.to.version, state: r.to.state } });
});
