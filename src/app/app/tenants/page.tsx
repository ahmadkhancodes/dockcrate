import { PageHeader, Panel } from "@/components/app/page-header";
import { Notice } from "@/components/ui/states";
import { apiCtx } from "@/lib/api/ctx";
import { canAccess, filterTenants } from "@/lib/authz";
import { PERMISSIONS, type Tenant } from "@/lib/tenants";
import { TenantsClient } from "./tenants-client";

export const metadata = { title: "Tenants" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TenantsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { org, membership, deps } = await apiCtx({ page: true });
  const tenants = filterTenants(membership, await deps.db.collection<Tenant>("tenants").find({ orgId: org.org.id })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const consent = one(sp.consent);
  return (
    <>
      <PageHeader title="Tenants" description="Each customer Microsoft tenant is connected once, by an admin, with three permissions." />
      {consent ? (
        <div className="mb-6">
          <Notice tone={consent === "connected" ? "success" : consent === "waiting" ? "warning" : "danger"} title={consent === "connected" ? "Connected" : consent === "waiting" ? "Waiting for Microsoft" : "Consent did not complete"}>
            {consent === "connected" ? "Consent received and verified." : one(sp.message) ?? "Try again, or send the consent link to an admin."}
          </Notice>
        </div>
      ) : null}
      <TenantsClient tenants={tenants} canConnect={canAccess(membership, "tenant", "connect")} />
      <div className="mt-6">
        <Panel title="Permissions we ask for" description="Application permissions, granted once by a Global Administrator. We never store customer secrets.">
          <ul className="flex flex-col gap-3">
            {PERMISSIONS.map((p) => (
              <li key={p.name} className="flex flex-col gap-1">
                <code className="break-all font-mono caption-2 text-text">{p.name}</code>
                <span className="body-6 text-text-subtle">{p.why}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
