import Link from "next/link";
import { DataTable, Td } from "@/components/app/data-table";
import { formatDate } from "@/components/app/api";
import { PageHeader, Panel } from "@/components/app/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/states";
import { apiCtx } from "@/lib/api/ctx";
import { filterTenants } from "@/lib/authz";
import type { DeviceCount } from "@/lib/billing/devices";
import { listCatalog } from "@/lib/catalog";
import { MSP_KINDS, mspOverview, parseMspFilter } from "@/lib/msp/overview";
import type { Deployment } from "@/lib/rings/types";
import { STATUS_LABEL, type Alert, type Tenant } from "@/lib/tenants";

export const metadata = { title: "MSP dashboard" };
export const dynamic = "force-dynamic";

const tone = { connected: "success", waiting_consent: "warning", disconnected: "danger", pending: "info" } as const;

/** Cross tenant view: out of date apps, paused rings, disconnected tenants and device counts, for the tenants this member may see. */
export default async function MspPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { org, membership, deps } = await apiCtx({ page: true });
  const orgId = org.org.id;
  const filter = parseMspFilter(sp);
  const tenants = filterTenants(membership, await deps.db.collection<Tenant>("tenants").find({ orgId })).sort((a, b) => a.name.localeCompare(b.name));
  if (tenants.length === 0) {
    return (
      <>
        <PageHeader title="MSP dashboard" description="Every client tenant at a glance." />
        <EmptyState title="No tenants to compare yet" body="Connect your first client tenant. Out of date apps, paused rings and disconnected tenants from all of them show up here." action={<Link href="/app/tenants" className={buttonClass("primary")}>Connect a tenant</Link>} />
      </>
    );
  }
  const ids = new Set(tenants.map((t) => t.id));
  const [entries, deployments, deviceCounts, alerts] = await Promise.all([
    listCatalog(deps.db),
    deps.db.collection<Deployment>("deployments").find({ orgId }),
    deps.db.collection<DeviceCount>("device_counts").find({ orgId }),
    deps.db.collection<Alert>("alerts").find({ orgId }),
  ]);
  const o = mspOverview({ tenants, deployments: deployments.filter((d) => ids.has(d.tenantId)), entries, deviceCounts, alerts }, filter);
  const filtered = !!(filter.tenant || filter.q || (filter.kind && filter.kind !== "all"));
  const empty = o.outdated.length + o.paused.length + o.disconnected.length === 0;
  const kpis = [
    { label: "Out of date", value: o.totals.outdated, note: "apps behind the catalog" },
    { label: "Paused rings", value: o.totals.paused, note: "waiting for you" },
    { label: "Disconnected", value: o.totals.disconnected, note: "tenants not reachable" },
    { label: "Devices", value: o.totals.devices, note: `across ${o.totals.tenants} tenant${o.totals.tenants === 1 ? "" : "s"}` },
  ];
  const dock = (t: string, app?: string) => `/app?tenant=${t}${app ? `&app=${app}` : ""}`;
  return (
    <>
      <PageHeader title="MSP dashboard" description={`${org.org.name}: what needs attention across every client tenant you can see.`} actions={<Link href="/app/app-sets" className={buttonClass("secondary")}>App Sets</Link>} />
      <ul className="mb-6 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface-raised md:grid-cols-4">
        {kpis.map((k) => (
          <li key={k.label} className="flex flex-col gap-1 border-b border-r border-border p-4 md:border-b-0 md:last:border-r-0">
            <p className="label-caps text-text-subtle">{k.label}</p>
            <p className="heading-4 tnum text-text">{k.value.toLocaleString("en")}</p>
            <p className="caption-5 text-text-subtle">{k.note}</p>
          </li>
        ))}
      </ul>
      <form method="get" aria-label="Filters" className="mb-6 grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <Field label="Tenant" htmlFor="m-tenant">
          <Select id="m-tenant" name="tenant" defaultValue={filter.tenant ?? ""}>
            <option value="">All tenants</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Show" htmlFor="m-kind">
          <Select id="m-kind" name="kind" defaultValue={filter.kind ?? "all"}>{MSP_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>
        </Field>
        <Field label="Search" htmlFor="m-q"><Input id="m-q" name="q" defaultValue={filter.q ?? ""} placeholder="App or tenant" autoComplete="off" /></Field>
        <div className="flex gap-2"><Button type="submit">Filter</Button>{filtered ? <Link href="/app/msp" className={buttonClass("secondary")}>Clear</Link> : null}</div>
      </form>

      {empty ? (
        <EmptyState
          title={filtered ? "Nothing matches these filters" : "All clear"}
          body={filtered ? "Clear a filter to see every tenant." : "No app is behind the catalog, no ring is paused and every tenant is reachable."}
          action={filtered ? <Link href="/app/msp" className={buttonClass("secondary")}>Clear filters</Link> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {o.paused.length > 0 ? (
            <Panel title="Paused rings" description="Bay 2 stopped after Pilot failures. Roll back or review in the dock.">
              <DataTable caption="Paused rings" columns={[{ key: "t", label: "Tenant" }, { key: "a", label: "App" }, { key: "v", label: "Version" }, { key: "r", label: "Reason" }, { key: "o", label: "Actions", align: "right" }]}>
                {o.paused.map((r) => (
                  <tr key={`${r.tenantId}:${r.slug}`}>
                    <Td>{r.tenantName}</Td><Td>{r.appName}</Td><Td className="font-mono">{r.deployed}</Td><Td muted>{r.reason ?? "Paused"}</Td>
                    <Td align="right"><Link href={dock(r.tenantId, r.slug)} className={buttonClass("secondary", "sm")}>Open</Link></Td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          ) : null}
          {o.outdated.length > 0 ? (
            <Panel title="Out of date" description="Deployed version is behind the verified catalog version.">
              <DataTable caption="Out of date apps" columns={[{ key: "t", label: "Tenant" }, { key: "a", label: "App" }, { key: "d", label: "Deployed" }, { key: "l", label: "Catalog" }, { key: "o", label: "Actions", align: "right" }]}>
                {o.outdated.map((r) => (
                  <tr key={`${r.tenantId}:${r.slug}`}>
                    <Td>{r.tenantName}</Td><Td>{r.appName}</Td><Td className="font-mono">{r.deployed}</Td><Td className="font-mono">{r.latest}</Td>
                    <Td align="right"><Link href={dock(r.tenantId, r.slug)} className={buttonClass("secondary", "sm")}>Open</Link></Td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          ) : null}
          {o.disconnected.length > 0 ? (
            <Panel title="Disconnected tenants" description="Jobs for these tenants are stopped until consent is back.">
              <DataTable caption="Disconnected tenants" columns={[{ key: "t", label: "Tenant" }, { key: "s", label: "Status" }, { key: "e", label: "Detail" }, { key: "o", label: "Actions", align: "right" }]}>
                {o.disconnected.map((t) => (
                  <tr key={t.id}>
                    <Td>{t.name}</Td><Td><Badge tone={t.paused && t.status === "connected" ? "warning" : tone[t.status]}>{t.paused && t.status === "connected" ? "Paused" : STATUS_LABEL[t.status]}</Badge></Td>
                    <Td muted>{t.lastError ?? (t.paused ? "Paused by an operator." : "")}</Td>
                    <Td align="right"><Link href={`/app/tenants?tenant=${t.id}`} className={buttonClass("secondary", "sm")}>Open connection</Link></Td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          ) : null}
        </div>
      )}

      <div className="mt-6">
        <Panel title="Devices by tenant" description="Managed devices counted nightly from Graph install data.">
          {o.tenants.length === 0 ? <p className="body-6 text-text-subtle">No tenant matches the search.</p> : (
            <DataTable caption="Devices by tenant" columns={[{ key: "t", label: "Tenant" }, { key: "s", label: "Status" }, { key: "d", label: "Devices", align: "right" }, { key: "c", label: "Counted" }]}>
              {o.tenants.map((t) => (
                <tr key={t.id}>
                  <Td><Link href={dock(t.id)} className="text-text underline-offset-2 hover:underline focus-visible:focus-ring">{t.name}</Link></Td>
                  <Td><Badge tone={tone[t.status]}>{STATUS_LABEL[t.status]}</Badge></Td>
                  <Td align="right" className="tnum">{t.devices ?? "Not counted yet"}</Td>
                  <Td muted>{t.countedAt ? formatDate(t.countedAt) : "Counted tonight"}</Td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      </div>
    </>
  );
}
