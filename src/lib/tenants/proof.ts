import { createPublicKey, randomBytes, verify as rsaVerify, type JsonWebKey } from "node:crypto";
import { entraClientId } from "@/lib/env";

/** Microsoft Entra built-in role template ids that may approve an app for a tenant. They appear in the `wids` claim. */
export const ADMIN_ROLE_IDS = [
  "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
  "e8611ab8-c189-46e8-94e1-60213ab1f814", // Privileged Role Administrator
  "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
  "158c047a-c907-4556-b7ef-446551a6b5f7", // Cloud Application Administrator
];

export const proofRedirectUri = (baseUrl: string) => `${baseUrl}/api/tenants/consent/proof`;

/**
 * The sign-in that proves the person holds an admin role in the tenant being linked. Authorize endpoint of THAT tenant, so only
 * an account of that tenant can complete it; `id_token` + `form_post` returns a signed token to our proof route.
 */
export function buildProofUrl(opts: { baseUrl: string; tenant: string; state: string; nonce: string; clientId?: string }): string {
  const q = new URLSearchParams({
    client_id: opts.clientId ?? entraClientId() ?? "", response_type: "id_token", response_mode: "form_post", scope: "openid profile",
    redirect_uri: proofRedirectUri(opts.baseUrl), state: opts.state, nonce: opts.nonce, prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${opts.tenant}/oauth2/v2.0/authorize?${q}`;
}

export const newNonce = () => randomBytes(16).toString("base64url");

export interface ProofCheck { tenant: string; clientId: string; nonce: string; now: number; fetchImpl?: typeof fetch }
export type ProofResult = { ok: true; claims: Record<string, unknown> } | { ok: false; reason: string };

const b64 = (s: string) => Buffer.from(s, "base64url");

/** Verifies an Entra v2 id_token (RS256 against the tenant's published keys) and that its holder is an admin of `tenant`. */
export async function verifyAdminIdToken(idToken: string | null | undefined, c: ProofCheck): Promise<ProofResult> {
  const parts = idToken?.split(".") ?? [];
  if (parts.length !== 3) return { ok: false, reason: "no_token" };
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(b64(parts[0]!).toString("utf8"));
    claims = JSON.parse(b64(parts[1]!).toString("utf8"));
  } catch { return { ok: false, reason: "malformed" }; }
  if (header.alg !== "RS256" || !header.kid) return { ok: false, reason: "alg" };
  let jwk: JsonWebKey | undefined;
  try {
    const res = await (c.fetchImpl ?? fetch)(`https://login.microsoftonline.com/${c.tenant}/discovery/v2.0/keys`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, reason: "keys_unavailable" };
    jwk = ((await res.json()) as { keys: (JsonWebKey & { kid?: string })[] }).keys.find((k) => k.kid === header.kid);
  } catch { return { ok: false, reason: "keys_unavailable" }; }
  if (!jwk) return { ok: false, reason: "unknown_key" };
  let valid = false;
  try { valid = rsaVerify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), b64(parts[2]!)); } catch { /* invalid key material */ }
  if (!valid) return { ok: false, reason: "signature" };
  const sec = Math.floor(c.now / 1000);
  const tid = typeof claims.tid === "string" ? claims.tid.toLowerCase() : "";
  if (tid !== c.tenant.toLowerCase()) return { ok: false, reason: "tenant_mismatch" };
  if (claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) return { ok: false, reason: "issuer" };
  if (claims.aud !== c.clientId) return { ok: false, reason: "audience" };
  if (claims.nonce !== c.nonce) return { ok: false, reason: "nonce" };
  if (typeof claims.exp !== "number" || claims.exp < sec) return { ok: false, reason: "expired" };
  if (typeof claims.nbf === "number" && claims.nbf > sec + 300) return { ok: false, reason: "not_yet_valid" };
  const wids = Array.isArray(claims.wids) ? (claims.wids as unknown[]) : [];
  if (!wids.some((w) => typeof w === "string" && ADMIN_ROLE_IDS.includes(w.toLowerCase()))) return { ok: false, reason: "not_admin" };
  return { ok: true, claims };
}
