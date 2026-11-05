import Link from "next/link";
import { Warning } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app/page-header";
import { BayTrack, CrateLabel, CrateMonogram, InspectionTag, StatusChip } from "@/components/dock/crate";
import { ManifestActions } from "@/components/dock/manifest-actions";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, Notice } from "@/components/ui/states";
import { apiCtx } from "@/lib/api/ctx";
import { canAccess, filterTenants } from "@/lib/authz";
import { listCatalog } from "@/lib/catalog";
import { toCrate } from "@/lib/catalog/view";
import { dockRows } from "@/lib/rings/view";
import type { Deployment, RingConfig, TenantApp } from "@/lib/rings/types";
import { STATUS_LABEL, type Alert, type Tenant } from "@/lib/tenants";

export const metadata = { title: "Dock" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const tone = { connected: "success", waiting_consent: "warning", disconnected: "danger", pending: "info" } as const;

/** The dock overview: tenant switcher, apps with the inspection tag and bay track, and the manifest of the selected app. */
export default async function DockPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { org, membership, deps } = await apiCtx({ page: true });
  const orgId = org.org.id;
  const tenants = filterTenants(membership, await deps.db.collection<Tenant>("tenants").find({ orgId })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (tenants.length === 0) {
    return (
      <>
        <PageHeader title="Dock" description={`${org.org.name}: every app, every tenant, every bay.`} />
        <EmptyState
          title="No tenants connected yet"
          body="Connect a Microsoft tenant to see its apps here. An admin approves three permissions once; you can email them a link if you are not an admin."
          action={<Link href="/app/tenants" className={buttonClass("primary")}>Connect a tenant</Link>}
        />
      </>
    );
  }

  const tenant = tenants.find((t) => t.id === one(sp.tenant)) ?? tenants.find((t) => t.status === "connected") ?? tenants[0]!;
  const [entries, deployments, config, tenantApps, alerts] = await Promise.all([
    listCatalog(deps.db),
    deps.db.collection<Deployment>("deployments").find({ tenantId: tenant.id }),
    deps.db.collection<RingConfig>("ring_configs").get(tenant.id),
    deps.db.collection<TenantApp>("tenant_apps").find({ tenantId: tenant.id }),
    deps.db.collection<Alert>("alerts").find({ orgId }),
  ]);
  const rows = dockRows(entries, deployments, config);
  const selected = rows.find((r) => r.slug === one(sp.app)) ?? rows.find((r) => r.paused) ?? rows[0];
  const entry = entries.find((e) => e.app.slug === selected?.slug);
  const canOperate = canAccess(membership, "deployment", "publish", tenant.id) && tenant.status === "connected";
  const disconnected = tenants.filter((t) => t.status === "disconnected").length;
  const kpis = [
    { label: "Out of date", value: String(rows.filter((r) => r.outOfDate).length), note: `in ${tenant.name}` },
    { label: "Paused rings", value: String(rows.filter((r) => r.paused).length), note: rows.find((r) => r.paused)?.name ?? "None paused" },
    { label: "Disconnected", value: String(disconnected), note: disconnected ? "consent revoked" : "all tenants reachable" },
    { label: "Published", value: `${rows.filter((r) => r.deployedVersion).length} / ${rows.length}`, note: "apps in this tenant" },
  ];
  const openAlerts = alerts.filter((a) => a.tenantId === tenant.id && !a.ackAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2);

  return (
    <>
      <PageHeader title="Dock" description={`${org.org.name}: every app, every tenant, every bay.`} actions={<><Link href="/app/msp" className={buttonClass("secondary")}>MSP view</Link>{tenant.status === "connected" ? <Link href={`/app/rings/${tenant.id}`} className={buttonClass("secondary")}>Rings</Link> : null}<Link href="/app/tenants" className={buttonClass("secondary")}>Tenants</Link></>} />
      <nav aria-label="Tenant switcher" className="mb-6 flex flex-wrap gap-2">
        {tenants.map((t) => (
          <Link key={t.id} href={`/app?tenant=${t.id}`} aria-current={t.id === tenant.id ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 body-5 focus-visible:focus-ring ${t.id === tenant.id ? "border-text bg-surface-sunken text-text" : "border-border-strong text-text-subtle hover:bg-surface-raised"}`}>
            {t.name} <Badge tone={tone[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          </Link>
        ))}
      </nav>
      {tenant.status !== "connected" ? (
        <div className="mb-6"><Notice tone={tenant.status === "disconnected" ? "danger" : "warning"} title={STATUS_LABEL[tenant.status]} action={<Link href={`/app/tenants?tenant=${tenant.id}`} className={buttonClass("secondary")}>Open connection</Link>}>
          {tenant.status === "disconnected" ? "Consent was revoked, so jobs for this tenant are stopped. Reconnect to resume." : tenant.status === "waiting_consent" ? `Waiting for admin${tenant.consentSentTo ? ` (link sent to ${tenant.consentSentTo})` : ""}.` : "Finish connecting this tenant to publish apps."}
        </Notice></div>
      ) : null}
      {openAlerts.map((a) => <div key={a.id} className="mb-3"><Notice tone={a.severity === "critical" ? "danger" : "warning"} title={a.kind}>{a.message}</Notice></div>)}
      {!config && tenant.status === "connected" ? <div className="mb-6"><Notice tone="info" title="Rings not set up" action={<Link href={`/app/rings/${tenant.id}`} className={buttonClass("primary")}>Set up rings</Link>}>Pick the Pilot and Broad groups for this tenant before publishing.</Notice></div> : null}

      <div className="grid overflow-hidden rounded-md border border-border bg-surface-raised lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <ul className="grid grid-cols-2 border-b border-border md:grid-cols-4">
            {kpis.map((k) => (
              <li key={k.label} className="flex flex-col gap-1 border-b border-r border-border p-4 md:border-b-0 md:last:border-r-0">
                <p className="label-caps text-text-subtle">{k.label}</p>
                <p className="heading-4 tnum text-text">{k.value}</p>
                <p className="caption-5 text-text-subtle">{k.note}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline gap-3 px-4 py-3">
            <p className="heading-6 uppercase text-text">Apps</p>
            <p className="caption-2 text-text-subtle">{tenant.name} · Pilot {config?.pilot.delayHours ?? 0} h · Broad {config?.broad.delayHours ?? 48} h</p>
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.slug} className={`border-t border-border ${r.slug === selected?.slug ? "bg-surface-sunken" : ""}`}>
                <Link href={`/app?tenant=${tenant.id}&app=${r.slug}`} aria-current={r.slug === selected?.slug ? "true" : undefined} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 focus-visible:focus-ring md:grid-cols-[1fr_auto_4rem_auto]">
                  <span className="flex min-w-0 items-center gap-3">
                    <CrateMonogram name={r.name} />
                    <span className="min-w-0">
                      <span className="block truncate title-4 text-text">{r.name}</span>
                      <span className="block truncate caption-5 text-text-subtle">{r.publisher}</span>
                    </span>
                  </span>
                  <span className="hidden font-mono caption-2 text-text md:block">{r.deployedVersion ?? r.catalogVersion}</span>
                  <span className="hidden w-16 md:block"><BayTrack bays={r.bays} compact /></span>
                  <span className="flex flex-wrap items-center justify-end gap-2"><InspectionTag checks={r.checks} className="hidden md:inline-flex" /><StatusChip status={r.status} label={r.statusLabel} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {selected && entry ? (
          <aside aria-label="Manifest of the selected app" className="flex min-w-0 flex-col gap-4 border-t border-border p-4 lg:col-span-4 lg:border-l lg:border-t-0 lg:p-6">
            <div>
              <p className="label-caps text-text-subtle">Manifest</p>
              <p className="heading-5 uppercase text-text">{selected.name} {selected.catalogVersion}</p>
            </div>
            <CrateLabel crate={toCrate(entry, selected.status, selected.statusLabel)} size="md" className="p-4 md:p-4" />
            {selected.paused ? (
              <div role="status" className="flex gap-3 rounded-sm border border-warning bg-warning-surface p-3">
                <Warning size={20} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                <p className="body-6 text-text"><strong className="font-semibold">Bay 2 paused.</strong> {selected.pausedReason} Roll back or review the log.</p>
              </div>
            ) : null}
            {selected.publishReason ? <p className="body-6 text-text-subtle">{selected.publishReason}</p> : null}
            <ManifestActions
              tenantId={tenant.id} slug={selected.slug} versionId={entry.version.id} name={selected.name} deploymentId={selected.deploymentId} rollbackTo={selected.rollbackTo}
              canPublish={selected.canPublish} ringsReady={!!config} canOperate={canOperate} hasDeployment={!!selected.deployedVersion}
              autoUpdate={tenantApps.find((a) => a.appSlug === selected.slug)?.autoUpdate ?? config?.autoUpdateDefault ?? true}
            />
            {selected.rollbackTo ? <p className="caption-2 text-text-subtle">Rollback re-assigns {selected.rollbackTo.version} as Required and {selected.deployedVersion} as Uninstall for the rings it reached. An audit entry is written.</p> : null}
          </aside>
        ) : null}
      </div>
    </>
  );
}
