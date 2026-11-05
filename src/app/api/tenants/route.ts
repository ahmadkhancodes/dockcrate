import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { authorize, filterTenants } from "@/lib/authz";
import { json, readJson, withApi } from "@/lib/http";
import { STATUS_LABEL, buildConsentUrl, createTenant, type Tenant } from "@/lib/tenants";

export const runtime = "nodejs";

export const GET = withApi(async () => {
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "tenant", "read");
  const all = await deps.db.collection<Tenant>("tenants").find({ orgId: org.org.id });
  return json({ tenants: filterTenants(membership, all).map((t) => ({ ...t, statusLabel: STATUS_LABEL[t.status] })) });
});

export const POST = withApi(async (req) => {
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "tenant", "connect");
  const { name } = await readJson(req, z.object({ name: z.string().min(2).max(80) }));
  const tenant = await createTenant(deps, { orgId: org.org.id, name, actorId: org.user.id });
  return json({ tenant, consentUrl: buildConsentUrl({ baseUrl: deps.baseUrl, orgId: tenant.orgId, tenantId: tenant.id }) }, 201);
});
