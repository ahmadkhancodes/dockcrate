import { apiCtx } from "@/lib/api/ctx";
import { authorize } from "@/lib/authz";
import { HttpError, json, withApi } from "@/lib/http";
import { getTenant } from "@/lib/tenants";

export const runtime = "nodejs";

export const GET = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "ring", "read", id);
  const t = await getTenant(deps, org.org.id, id);
  if (t.status !== "connected" || !t.entraTenantId) throw new HttpError(409, "tenant_not_connected");
  return json({ groups: await deps.graph.forTenant(t.entraTenantId).listGroups() });
});
