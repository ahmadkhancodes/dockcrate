import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { authorize } from "@/lib/authz";
import { json, readJson, withApi } from "@/lib/http";
import { STATUS_LABEL, assertConnectAvailable, getTenant, sendConsentLink } from "@/lib/tenants";

export const runtime = "nodejs";

/** "Send consent link to admin": emails a signed 7 day link through the Mailer. */
export const POST = withApi(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "tenant", "connect", id);
  assertConnectAvailable();
  const { email } = await readJson(req, z.object({ email: z.string().email().max(200) }));
  const t = await sendConsentLink(deps, await getTenant(deps, org.org.id, id), email, org.user.id);
  return json({ tenant: { ...t, statusLabel: STATUS_LABEL[t.status] } });
});
