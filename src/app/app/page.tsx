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
        <PageHeader title="Dock" description={`${org.org.name}: every app, every tenant, every ring.`} />
        <EmptyState
          title="No tenants connected yet"
          body="Connect a Microsoft tenant to see its apps here. An admin approves three permissions once; you can email them a link if you are not an admin."
          action={<Link href="/app/tenants" className={buttonClass("primary")}>Connect a tenant</Link>}
          example={
            <ul className="flex flex-col rounded-md border border-border bg-surface-raised">
              {[["7-Zip", "25.01", "Pilot 14/14 · Broad in 31 h"], ["Google Chrome", "152.0.6913", "Pilot and Broad installed"], ["Zoom Workplace", "6.3.1", "Broad paused, roll back offered"]].map(([n, v, st]) => (
                <li key={n} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
                  <span className="min-w-0"><span className="block truncate body-5 text-text">{n}</span><span className="font-mono caption-5 text-text-subtle">{v}</span></span>
                  <span className="text-right font-mono caption-5 text-text-subtle">{st}</span>
                </li>
              ))}
            </ul>
          }
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
      <PageHeader title="Dock" description={`${org.org.name}: every app, every tenant, every ring.`} actions={<><Link href="/app/msp" className={buttonClass("tertiary")}>MSP view</Link><Link href="/app/tenants" className={buttonClass("tertiary")}>Tenants</Link><a href={`/api/tenants/${tenant.id}/export`} className={buttonClass("tertiary")}>Export CSV</a>{tenant.status === "connected" ? <Link href={`/app/rings/${tenant.id}`} className={buttonClass("secondary")}>Ring settings</Link> : null}</>} />
      <nav aria-label="Tenant switcher" className="-mt-2 flex gap-1 overflow-x-auto border-b border-border">
        {tenants.map((t) => (
          <Link key={t.id} href={`/app?tenant=${t.id}`} aria-current={t.id === tenant.id ? "page" : undefined}
            className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 body-5 transition-colors duration-200 focus-visible:focus-ring ${t.id === tenant.id ? "font-semibold text-text after:absolute after:inset-x-3 after:-bottom-px after:h-1 after:bg-accent" : "text-text-subtle hover:text-text"}`}>
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
      {one(sp.rings) === "saved" && config && !rows.some((r) => r.deployedVersion) ? <div className="mb-6"><Notice tone="success" title="Rings saved">Pick an app below and choose Publish to Pilot. It goes to {config.pilot.groupName || "your Pilot group"} first.</Notice></div> : null}
      {!config && tenant.status === "connected" ? <div className="mb-6"><Notice tone="info" title="Rings not set up" action={<Link href={`/app/rings/${tenant.id}`} className={buttonClass("primary")}>Set up rings</Link>}>Pick the Pilot and Broad groups for this tenant before publishing.</Notice></div> : null}

      {tenant.status === "connected" && (!config || !rows.some((r) => r.deployedVersion)) ? (
        <section aria-label="Getting started" className="mb-6 rounded-lg border border-border-strong bg-surface-raised p-4">
          <h2 className="title-3 font-semibold text-text">Get to your first published app</h2>
          <ol className="mt-3 flex flex-col gap-2 body-5">
            {[
              { done: true, label: "Connect a tenant", href: "/app/tenants" },
              { done: !!config, label: "Pick the Pilot and Broad groups", href: `/app/rings/${tenant.id}` },
              { done: rows.some((r) => r.deployedVersion), label: "Publish an app to Pilot (select one below, then Publish)", href: "/app" },
            ].map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span aria-hidden className={`inline-flex size-5 items-center justify-center rounded-sm border text-xs ${s.done ? "border-success bg-success-surface text-success" : "border-border text-text-muted"}`}>{s.done ? "✓" : ""}</span>
                {s.done ? <span className="text-text-subtle line-through">{s.label}</span> : <Link href={s.href} className="text-text underline underline-offset-2 focus-visible:focus-ring">{s.label}</Link>}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <ul aria-label="Dock summary" className="grid grid-cols-2 overflow-hidden rounded-lg border-2 border-text bg-surface-raised md:grid-cols-4">
        {kpis.map((k) => (
          <li key={k.label} className="-mb-px -mr-px flex flex-col gap-1 border-b border-r border-border px-4 py-3">
            <p className="label-caps text-text-subtle">{k.label}</p>
            <p className="figure-md text-text">{k.value}</p>
            <p className="truncate font-mono caption-5 text-text-muted">{k.note}</p>
          </li>
        ))}
      </ul>

      <div className="grid overflow-hidden rounded-lg border-2 border-text bg-surface-raised lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-surface-inverse px-4 py-3">
            <h2 className="title-3 font-semibold text-text-inverse">Apps in <span className="stencil uppercase">{tenant.name}</span></h2>
            <p className="font-mono caption-5 text-text-inverse-subtle">Pilot {config?.pilot.delayHours ?? 0} h · Broad {config?.broad.delayHours ?? 48} h</p>
          </div>
          <div aria-hidden className="hazard h-2 border-y-2 border-text" />
          <div aria-hidden className="hidden grid-cols-[1fr_8rem_4rem_auto] gap-x-3 bg-surface-sunken px-4 py-2 label-caps text-text-subtle md:grid">
            <span>App</span><span>Version</span><span>Rings</span><span className="text-right">Status</span>
          </div>
          <ul aria-label="Apps">
            {rows.map((r) => (
              <li key={r.slug} className={`border-t border-border transition-colors duration-200 ${r.slug === selected?.slug ? "bg-mark/40 shadow-[inset_4px_0_0_var(--accent)]" : "hover:bg-surface"}`}>
                <Link href={`/app?tenant=${tenant.id}&app=${r.slug}`} aria-current={r.slug === selected?.slug ? "true" : undefined} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-2 focus-visible:focus-ring focus-visible:[outline-offset:-2px] md:grid-cols-[1fr_8rem_4rem_14rem]">
                  <span className="flex min-w-0 items-center gap-3">
                    <CrateMonogram name={r.name} />
                    <span className="min-w-0">
                      <span className="block truncate body-4 text-text">{r.name}</span>
                      <span className="block truncate caption-5 text-text-subtle">{r.publisher}</span>
                    </span>
                  </span>
                  <span className="hidden truncate font-mono caption-2 tnum text-text md:block">{r.deployedVersion ?? r.catalogVersion}</span>
                  <span className="hidden w-16 md:block"><BayTrack bays={r.bays} compact /></span>
                  <span className="flex flex-wrap items-center justify-end gap-2"><InspectionTag checks={r.checks} className="max-md:hidden!" /><StatusChip status={r.status} label={r.statusLabel} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {selected && entry ? (
          <aside aria-label="Manifest of the selected app" className="flex min-w-0 flex-col gap-4 border-t-2 border-text p-4 lg:col-span-4 lg:border-l-2 lg:border-t-0 lg:p-6">
            <CrateLabel crate={toCrate(entry, selected.status, selected.statusLabel)} size="md" />
            {selected.paused ? (
              <div role="status" className="flex gap-3 rounded-md border border-warning bg-warning-surface p-3">
                <Warning size={20} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                <p className="body-6 text-text"><strong className="font-semibold">Broad paused.</strong> {selected.pausedReason} Roll back or review the log.</p>
              </div>
            ) : null}
            {selected.publishReason ? <p className="body-6 text-text-subtle">{selected.publishReason}</p> : null}
            <ManifestActions
              tenantId={tenant.id} slug={selected.slug} versionId={entry.version.id} name={selected.name} deploymentId={selected.deploymentId} rollbackTo={selected.rollbackTo}
              canPublish={selected.canPublish} ringsReady={!!config} canOperate={canOperate} hasDeployment={!!selected.deployedVersion}
              autoUpdate={tenantApps.find((a) => a.appSlug === selected.slug)?.autoUpdate ?? config?.autoUpdateDefault ?? true}
            />
            {selected.rollbackTo ? <p className="caption-2 text-text-subtle">Rollback assigns {selected.rollbackTo.version} as Required and {selected.deployedVersion} as Uninstall for the rings it reached. An audit entry is written.</p> : null}
          </aside>
        ) : null}
      </div>
    </>
  );
}
