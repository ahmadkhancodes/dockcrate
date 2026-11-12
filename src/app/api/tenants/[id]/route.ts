import { apiCtx } from "@/lib/api/ctx";
import { authorize } from "@/lib/authz";
import { json, withApi } from "@/lib/http";
import { entraClientId } from "@/lib/env";
import { STATUS_LABEL, buildConsentUrl, getTenant, verifyTenant } from "@/lib/tenants";

export const runtime = "nodejs";

/** Status poll for the connect screen: re-verifies while waiting, so "Connected" shows within seconds of consent. */
export const GET = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "tenant", "read", id);
  let t = await getTenant(deps, org.org.id, id);
  if (t.status === "waiting_consent" && t.entraTenantId) t = await verifyTenant(deps, t);
  return json({ tenant: { ...t, statusLabel: STATUS_LABEL[t.status] }, consentUrl: entraClientId() ? buildConsentUrl({ baseUrl: deps.baseUrl, orgId: t.orgId, tenantId: t.id }) : null });
});
