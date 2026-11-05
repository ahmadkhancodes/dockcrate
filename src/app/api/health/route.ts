import { getDb } from "@/lib/db";
import { dbDriver } from "@/lib/env";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness plus a real database read, so an uptime monitor sees a Mongo outage (503) instead of a green check. */
export async function GET() {
  const base = { db: dbDriver(), version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", at: new Date().toISOString() };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 3000); });
    await Promise.race([getDb().then((db) => db.collection<{ id: string }>("health").get("ping")), timeout]);
    return json({ ok: true, ...base });
  } catch {
    return json({ ok: false, ...base, error: "db_unavailable" }, 503);
  } finally {
    clearTimeout(timer);
  }
}
