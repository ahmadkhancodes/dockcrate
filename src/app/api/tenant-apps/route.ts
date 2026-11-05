import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { authorize } from "@/lib/authz";
import { json, readJson, withApi } from "@/lib/http";
import { setAutoUpdate } from "@/lib/rings/engine";
import { getTenant } from "@/lib/tenants";

export const runtime = "nodejs";

/** Per app, per tenant auto update toggle. */
export const POST = withApi(async (req) => {
  const { org, membership, deps } = await apiCtx();
  const b = await readJson(req, z.object({ tenantId: z.string().min(1), appSlug: z.string().min(1), autoUpdate: z.boolean() }));
  authorize(membership, "deployment", "publish", b.tenantId);
  await getTenant(deps, org.org.id, b.tenantId);
  await setAutoUpdate(deps, { orgId: org.org.id, ...b, actorId: org.user.id });
  return json({ ok: true });
});
