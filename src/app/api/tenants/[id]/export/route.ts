import { apiCtx } from "@/lib/api/ctx";
import { authorize } from "@/lib/authz";
import { listCatalog } from "@/lib/catalog";
import { dockCsv } from "@/lib/dock-export";
import { withApi } from "@/lib/http";
import type { Deployment, RingConfig } from "@/lib/rings/types";
import { dockRows } from "@/lib/rings/view";
import { getTenant } from "@/lib/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV of the tenant's dock (what is published where). Scoped by org and tenant permission. */
export const GET = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { org, membership, deps } = await apiCtx();
  authorize(membership, "tenant", "read", id);
  const tenant = await getTenant(deps, org.org.id, id);
  const [entries, deployments, config] = await Promise.all([
    listCatalog(deps.db),
    deps.db.collection<Deployment>("deployments").find({ tenantId: tenant.id }),
    deps.db.collection<RingConfig>("ring_configs").get(tenant.id),
  ]);
  const slug = tenant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tenant";
  return new Response(dockCsv(dockRows(entries, deployments, config)), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="dockcrate-dock-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
  });
});
