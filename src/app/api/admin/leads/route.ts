import { requireUser, isFounderAdmin } from "@/lib/auth/session";
import { defaultDeps } from "@/lib/deps";
import { HttpError, withApi } from "@/lib/http";
import { leadsCsv, listLeads } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Founder-only CSV export of early-access leads, newest first. */
export const GET = withApi(async () => {
  const { user } = await requireUser();
  if (!isFounderAdmin(user.email)) throw new HttpError(404, "not_found");
  const csv = leadsCsv(await listLeads(await defaultDeps()));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="dockcrate-leads.csv"', "cache-control": "no-store" } });
});
