import { HttpError } from "@/lib/http";

/** The tenant id Microsoft uses for every personal (MSA) account. Never a work or school tenant. */
export const PERSONAL_MSA_TENANT = "9188040d-6c67-4c5b-b112-36a3c8b1b0b4";

export const WORK_ACCOUNT_MESSAGE = "DockCrate by BufferSol needs a work or school account. Personal Microsoft accounts (outlook.com, hotmail.com, live.com) cannot sign in.";

export interface EntraClaims {
  tid?: string | null;
  iss?: string | null;
  email?: string | null;
  preferred_username?: string | null;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a work or school tenant. A missing, malformed or personal `tid` is rejected. */
export function isWorkAccount(c: EntraClaims): boolean {
  const tid = c.tid?.toLowerCase();
  if (!tid || !GUID.test(tid) || tid === PERSONAL_MSA_TENANT) return false;
  if (c.iss && c.iss.toLowerCase().includes(PERSONAL_MSA_TENANT)) return false;
  return true;
}

export function assertWorkAccount(c: EntraClaims): void {
  if (!isWorkAccount(c)) throw new HttpError(403, "work_account_required", WORK_ACCOUNT_MESSAGE);
}

/** Decode (not verify) the payload of an ID token that Better Auth already validated. */
export function decodeIdTokenClaims(idToken: string | null | undefined): EntraClaims {
  try {
    const part = idToken?.split(".")[1];
    if (!part) return {};
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as EntraClaims;
  } catch {
    return {};
  }
}

export const ENTRA_AUTHORITY = "organizations";
