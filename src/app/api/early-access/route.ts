import { defaultDeps } from "@/lib/deps";
import { clientIp, HttpError, json, readJson, withApi } from "@/lib/http";
import { leadInput, saveLead } from "@/lib/leads";
import { verifyAltcha } from "@/lib/security/altcha";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public early-access form: rate limit per IP, ALTCHA proof of work, honeypot. */
export const POST = withApi(async (req) => {
  const deps = await defaultDeps();
  await enforceRateLimit(`early-access:${clientIp(req)}`, RULES.publicForm, deps.db);
  const body = await readJson(req, leadInput);
  if (body.website) return json({ ok: true }); // honeypot: pretend success
  if (!(await verifyAltcha(body.altcha, deps.db))) throw new HttpError(400, "captcha_failed");
  await saveLead(deps, body);
  return json({ ok: true });
});
