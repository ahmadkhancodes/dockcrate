import { apiCtx } from "@/lib/api/ctx";
import { deleteAppSet } from "@/lib/appsets";
import { authorize } from "@/lib/authz";
import { json, withApi } from "@/lib/http";

export const runtime = "nodejs";

export const DELETE = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "deployment", "publish");
  await deleteAppSet(deps, org.org.id, id, org.user.id);
  return json({ ok: true });
});
