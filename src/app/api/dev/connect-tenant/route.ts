import { apiCtx } from "@/lib/api/ctx";
import { json, withApi } from "@/lib/http";
import { getTenant, type Tenant } from "@/lib/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * E2E and screenshot runs only: marks one of the active org's tenants as connected, as if the Entra admin consent
 * had completed. 404 unless E2E_OUTBOX=1 (never set on Vercel). Works with the fake Graph client only.
 */
const connect = withApi(async (req) => {
  const { org, deps } = await apiCtx();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const t = await getTenant(deps, org.org.id, id);
  const now = deps.now().toISOString();
  const c: Tenant = { ...t, status: "connected", entraTenantId: t.entraTenantId ?? `e2e-${t.id}`, connectedAt: now, updatedAt: now };
  await deps.db.collection<Tenant>("tenants").put(c);
  return json({ tenant: c });
});

export async function POST(req: Request, ctx: unknown) {
  if (process.env.E2E_OUTBOX !== "1") return json({ error: "not_found" }, 404);
  return connect(req, ctx);
}
