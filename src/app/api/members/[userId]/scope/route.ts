import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { getMembership } from "@/lib/auth/scope";
import { json, readJson, withApi } from "@/lib/http";
import { updateMemberScope } from "@/lib/members";
import { authorize } from "@/lib/authz";
import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import type { Tenant } from "@/lib/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function targetRole(orgId: string, userId: string): Promise<string> {
  const full = (await (await getAuth()).api.getFullOrganization({ headers: await headers(), query: { organizationId: orgId } })) as { members?: { userId: string; role: string }[] } | null;
  const m = (full?.members ?? []).find((x) => x.userId === userId);
  return m ? m.role.split(",")[0]! : "";
}

/** Current scope of a member plus the org's tenants, for the editor. */
export const GET = withApi(async (_req, { params }: { params: Promise<{ userId: string }> }) => {
  const { userId } = await params;
  const c = await apiCtx();
  authorize(c.membership, "member", "update");
  const role = await targetRole(c.org.org.id, userId);
  if (!role) return json({ error: "not_found" }, 404);
  const scope = (await getMembership(c.deps.db, c.org.org.id, userId, role)).tenantScope;
  const tenants = await c.deps.db.collection<Tenant>("tenants").find({ orgId: c.org.org.id });
  return json({ role, scope, tenants: tenants.map((t) => ({ id: t.id, name: t.name })) });
});

export const PUT = withApi(async (req, { params }: { params: Promise<{ userId: string }> }) => {
  const { userId } = await params;
  const c = await apiCtx();
  const { scope } = await readJson(req, z.object({ scope: z.union([z.literal("all"), z.array(z.string().max(80)).max(500)]) }));
  const role = await targetRole(c.org.org.id, userId);
  if (!role) return json({ error: "not_found" }, 404);
  const saved = await updateMemberScope(c.deps, { actor: c.membership, actorId: c.org.user.id, orgId: c.org.org.id, userId, targetRole: role, scope });
  return json({ scope: saved });
});
