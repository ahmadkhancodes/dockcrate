import { getDb } from "@/lib/db";
import type { AuditEntry } from "@/lib/db/types";

/** Client IP from the request that triggered the action, when there is one (cron jobs and tests have none). */
async function requestIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Append-only audit log. Actions are stable dotted names: "member.invited", "billing.checkout", "apikey.created". */
export async function audit(e: Omit<AuditEntry, "id" | "app" | "at">) {
  const db = await getDb();
  return db.appendAudit({ ...e, ip: e.ip ?? (await requestIp()) });
}
