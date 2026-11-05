import { defaultDeps } from "@/lib/deps";
import { handleConsentCallback } from "@/lib/tenants";
import { clientIp, withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Microsoft redirects the admin here after consent. The signed state carries the org and tenant row; no session is needed. */
export const GET = withApi(async (req) => {
  const q = new URL(req.url).searchParams;
  const deps = await defaultDeps();
  // Each call can trigger a Graph token request; cap it per IP.
  await enforceRateLimit(`consent-cb:${clientIp(req)}`, RULES.publicForm, deps.db);
  const r = await handleConsentCallback(deps, {
    state: q.get("state"), tenant: q.get("tenant"), admin_consent: q.get("admin_consent"), error: q.get("error"), error_description: q.get("error_description"),
  });
  const dest = new URL(r.tenantId ? "/app/tenants" : "/app", deps.baseUrl);
  if (r.tenantId) dest.searchParams.set("tenant", r.tenantId);
  dest.searchParams.set("consent", r.ok ? "connected" : r.status === "waiting_consent" ? "waiting" : "error");
  if (r.message) dest.searchParams.set("message", r.message.slice(0, 500));
  return Response.redirect(dest, 303);
}, { csrf: false });
