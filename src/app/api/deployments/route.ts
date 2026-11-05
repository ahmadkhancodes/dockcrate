import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { authorize } from "@/lib/authz";
import { json, readJson, withApi } from "@/lib/http";
import { defaultPublishCtx } from "@/lib/publish/ctx";
import { publishVersion } from "@/lib/publish/win32";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ tenantId: z.string().min(1), versionId: z.string().min(1), intent: z.enum(["required", "available"]).optional() });

/** Publish a catalog version to a tenant's Pilot ring as a Win32 app. */
export const POST = withApi(async (req) => {
  const { org, membership, deps } = await apiCtx();
  const input = await readJson(req, body);
  authorize(membership, "deployment", "publish", input.tenantId);
  const d = await publishVersion(deps, defaultPublishCtx(), { orgId: org.org.id, ...input, actorId: org.user.id });
  return json({ deployment: { id: d.id, state: d.state, step: d.step, version: d.version } }, 201);
});
