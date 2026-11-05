import { createHmac, timingSafeEqual } from "node:crypto";
import { env, isProd } from "@/lib/env";

/** Compact signed, expiring token: base64url(json).base64url(hmac). Used for consent state and consent links. */
const secret = () => env().BETTER_AUTH_SECRET ?? (isProd() ? "" : "dev-only-secret-dev-only-secret-0000");

export function signToken(payload: Record<string, string | number>, ttlMs: number, now = Date.now(), key = secret()): string {
  if (!key) throw new Error("signing_secret_missing");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now + ttlMs })).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

export function verifyToken<T extends Record<string, string | number>>(token: string, now = Date.now(), key = secret()): (T & { exp: number }) | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !key) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return typeof p.exp === "number" && p.exp > now ? p : null;
  } catch {
    return null;
  }
}
