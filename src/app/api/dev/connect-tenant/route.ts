import { apiCtx } from "@/lib/api/ctx";
import { authorize } from "@/lib/authz";
import { assertCanAddTenant } from "@/lib/billing/limits";
import { json, withApi } from "@/lib/http";
import { createTenant, getTenant, type Tenant } from "@/lib/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * E2E and screenshot runs only: marks one of the active org's tenants as connected, as if the Entra admin consent
 * had completed. With `?name=` instead of `?id=` it first adds the tenant (plan limits still apply), standing in for
 * "Add and connect" plus Microsoft's consent screen when no Entra app is registered. 404 unless E2E_OUTBOX=1 (never
 * set on Vercel). Works with the fake Graph client only.
 */
const connect = withApi(async (req) => {
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "tenant", "connect");
  const q = new URL(req.url).searchParams;
  const name = q.get("name");
  if (name) await assertCanAddTenant(deps.db, org.org.id, deps.now());
  const t = name ? await createTenant(deps, { orgId: org.org.id, name, actorId: org.user.id }) : await getTenant(deps, org.org.id, q.get("id") ?? "");
  const now = deps.now().toISOString();
  const c: Tenant = { ...t, status: "connected", entraTenantId: t.entraTenantId ?? `e2e-${t.id}`, connectedAt: now, updatedAt: now };
  await deps.db.collection<Tenant>("tenants").put(c);
  return json({ tenant: c });
});

export async function POST(req: Request, ctx: unknown) {
  if (process.env.E2E_OUTBOX !== "1") return json({ error: "not_found" }, 404);
  return connect(req, ctx);
}
