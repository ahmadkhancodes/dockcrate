import { defaultDeps } from "@/lib/deps";
import { handleConsentProof } from "@/lib/tenants";
import { clientIp, withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Entra posts the id_token here (response_mode=form_post, so it comes cross site: no CSRF check, the signed state and the token are the proof). */
export const POST = withApi(async (req) => {
  const deps = await defaultDeps();
  await enforceRateLimit(`consent-proof:${clientIp(req)}`, RULES.publicForm, deps.db);
  const f = await req.formData();
  const s = (k: string) => { const v = f.get(k); return typeof v === "string" ? v : null; };
  const r = await handleConsentProof(deps, { state: s("state"), id_token: s("id_token"), error: s("error"), error_description: s("error_description") });
  const dest = new URL(r.tenantId ? "/app/tenants" : "/app", deps.baseUrl);
  if (r.tenantId) dest.searchParams.set("tenant", r.tenantId);
  dest.searchParams.set("consent", r.ok ? "connected" : r.status === "waiting_consent" ? "waiting" : "error");
  if (r.message) dest.searchParams.set("message", r.message.slice(0, 500));
  return Response.redirect(dest, 303);
}, { csrf: false });
