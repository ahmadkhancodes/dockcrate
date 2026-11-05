import { PageHeader } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { apiCtx } from "@/lib/api/ctx";
import type { AppSet, AppSetRun } from "@/lib/appsets";
import { canAccess, filterTenants } from "@/lib/authz";
import { effectivePlan, planRank } from "@/lib/billing/entitlement";
import { listCatalog } from "@/lib/catalog";
import type { Tenant } from "@/lib/tenants";
import Link from "next/link";
import { AppSetsClient } from "./app-sets-client";

export const metadata = { title: "App Sets" };
export const dynamic = "force-dynamic";

export default async function AppSetsPage() {
  const { org, membership, deps } = await apiCtx({ page: true });
  const orgId = org.org.id;
  const plan = effectivePlan(await deps.db.getEntitlement(orgId), deps.now().getTime());
  const allowed = planRank(plan.id) >= planRank("professional");
  const [sets, runs, entries, tenants] = await Promise.all([
    deps.db.collection<AppSet>("app_sets").find({ orgId }),
    deps.db.collection<AppSetRun>("app_set_runs").find({ orgId }),
    listCatalog(deps.db),
    deps.db.collection<Tenant>("tenants").find({ orgId }),
  ]);
  const visible = filterTenants(membership, tenants).sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(visible.map((t) => t.id));
  return (
    <>
      <PageHeader title="App Sets" description="A named list of apps with ring defaults. Run it against many tenants at once, three at a time, and retry the ones that fail." />
      {!allowed ? <div className="mb-6"><Notice tone="info" title="App Sets start on Professional" action={<Link href="/app/billing" className={buttonClass("secondary")}>See plans</Link>}>Your {plan.name} plan can publish app by app from the dock. Professional adds App Sets and unlimited tenants.</Notice></div> : null}
      <AppSetsClient
        allowed={allowed}
        canRun={canAccess(membership, "deployment", "publish")}
        sets={sets.sort((a, b) => a.name.localeCompare(b.name))}
        apps={entries.map((e) => ({ slug: e.app.slug, name: e.app.name, publishable: e.version.status !== "held" && e.version.status !== "revoked" }))}
        tenants={visible.map((t) => ({ id: t.id, name: t.name, connected: t.status === "connected" }))}
        runs={runs.filter((r) => r.results.every((x) => ids.has(x.tenantId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)}
      />
    </>
  );
}
