import { requireOrg, requirePermission } from "@/lib/auth/session";
import { auditCsv, collectAudit, parseAuditFilter } from "@/lib/audit-export";
import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JSON page (`before` cursor) or, with `format=csv`, the whole filtered log as a CSV download. Filters: action, actor, from, to. */
export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "audit", "read");
  const sp = new URL(req.url).searchParams;
  const filter = parseAuditFilter(sp);
  const db = await getDb();
  if (sp.get("format") === "csv") {
    const entries = await collectAudit((o) => db.listAudit(ctx.org.id, o), filter);
    return new Response(auditCsv(entries), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="dockcrate-audit-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
    });
  }
  const b = sp.get("before");
  const before = b && !Number.isNaN(Date.parse(b)) ? new Date(b) : undefined;
  const to = before && (!filter.to || before < filter.to) ? before : filter.to;
  const entries = await collectAudit((o) => db.listAudit(ctx.org.id, o), { ...filter, to }, 50);
  return json({ entries });
});
