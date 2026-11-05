import { verifyChain } from "@/lib/audit-chain";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { HttpError, json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owners and admins: re-computes the hash chain of this organization's audit log and reports the first break, if any. */
export const POST = withApi(async () => {
  const ctx = await requireOrg();
  if (!can(ctx.role, "apiKey", "manage")) throw new HttpError(403, "forbidden");
  const db = await getDb();
  const result = await verifyChain(await db.auditChain(ctx.org.id));
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "audit.verified", meta: { ok: result.ok, checked: result.checked } });
  return json(result);
});
