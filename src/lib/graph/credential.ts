import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";
import { env } from "@/lib/env";

/** CredentialSigner (ARCHITECTURE section 2): signs Entra client assertions. Env PEM key now, OpenBao/KMS later. */
export interface CredentialSigner {
  signAssertion(opts: { clientId: string; tokenEndpoint: string; now?: number }): string;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Entra shows the SHA-1 thumbprint as hex (x5t is its base64url); a 64 char hex value is read as SHA-256 (x5t#S256). */
export function thumbprintHeader(thumbprint: string): Record<string, string> {
  const hex = thumbprint.replace(/[^0-9a-f]/gi, "");
  const bytes = Buffer.from(hex, "hex");
  return hex.length === 64 ? { "x5t#S256": b64u(bytes) } : { x5t: b64u(bytes) };
}

export function createPemCredentialSigner(privateKeyPem: string, thumbprint: string): CredentialSigner {
  const key = createPrivateKey(privateKeyPem);
  return {
    signAssertion({ clientId, tokenEndpoint, now = Date.now() }) {
      const iat = Math.floor(now / 1000);
      const header = { alg: "RS256", typ: "JWT", ...thumbprintHeader(thumbprint) };
      const claims = { aud: tokenEndpoint, iss: clientId, sub: clientId, jti: randomUUID(), nbf: iat, iat, exp: iat + 600 };
      const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
      return `${input}.${b64u(sign("RSA-SHA256", Buffer.from(input), key))}`;
    },
  };
}

export function envCredentialSigner(e = env()): CredentialSigner {
  const pem = e.ENTRA_CLIENT_CERT_PRIVATE_KEY_PEM?.replace(/\\n/g, "\n");
  if (!pem || !e.ENTRA_CLIENT_CERT_THUMBPRINT) throw new Error("entra_certificate_not_configured");
  return createPemCredentialSigner(pem, e.ENTRA_CLIENT_CERT_THUMBPRINT);
}

export const sha256Hex = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
