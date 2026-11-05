import { ArrowsClockwise, Buildings, ListChecks, Package, Gear, Stack, Sliders, SquaresFour, Warning } from "@phosphor-icons/react/dist/ssr";
import { demoCrates, demoTenant } from "@/content/demo";
import { BayTrack, CrateLabel, CrateMonogram, InspectionTag, StatusChip, CheckChips, DemoNote } from "./crate";

/** Hero visual: one real crate label plus two bay track rows. */
export function HeroDock() {
  const [, sevenZip, zoom] = [demoCrates[0], demoCrates[1]!, demoCrates[2]!];
  const rows = [sevenZip, zoom];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CrateLabel crate={sevenZip} />
      <div className="rounded-md border border-border bg-surface-raised">
        <div className="flex flex-wrap items-baseline gap-x-4 border-b border-border px-4 py-3">
          <p className="heading-6 uppercase text-text">Bay track</p>
          <p className="font-mono caption-2 text-text-subtle">{demoTenant.name} · {demoTenant.pilot} · {demoTenant.broad}</p>
        </div>
        <ul>
          {rows.map((c) => (
            <li key={c.slug} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto_10rem]">
              <div className="flex min-w-0 items-center gap-3">
                <CrateMonogram name={c.name} />
                <div className="min-w-0">
                  <p className="title-4 truncate text-text">{c.name}</p>
                  <p className="font-mono caption-5 text-text-subtle">{c.version}</p>
                </div>
              </div>
              <StatusChip status={c.status} label={c.statusLabel} />
              <BayTrack bays={c.bays} className="col-span-2 md:col-span-1" />
            </li>
          ))}
        </ul>
      </div>
      <DemoNote />
    </div>
  );
}

const sidebar = [
  { label: "Dock", Icon: SquaresFour, active: true },
  { label: "Tenants", Icon: Buildings },
  { label: "Catalog", Icon: Package },
  { label: "App Sets", Icon: Stack },
  { label: "Rings", Icon: Sliders },
  { label: "Audit", Icon: ListChecks },
  { label: "Settings", Icon: Gear },
];

const kpis = [
  { label: "Out of date", value: "7", note: "across 4 tenants" },
  { label: "Paused rings", value: "1", note: "Zoom 6.3.1, Bay 2" },
  { label: "Disconnected", value: "1", note: "consent revoked" },
  { label: "Devices", value: "108 / 250", note: "counted nightly" },
];

/** Dock overview: tenant board, crate rows and the manifest of the selected crate. */
export function DockOverview() {
  const selected = demoCrates[2]!;
  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="sr-only">Illustrative DockCrate by BufferSol dock overview with demo data</figcaption>
      <div className="grid overflow-hidden rounded-md border border-border bg-surface-raised lg:grid-cols-12">
        <nav aria-label="Demo sidebar" className="hidden flex-col gap-1 border-r border-border p-3 lg:col-span-2 lg:flex">
          <div className="mb-3 rounded-sm border border-border p-3">
            <p className="label-caps text-text-subtle">Tenant</p>
            <p className="title-4 text-text">{demoTenant.name}</p>
          </div>
          {sidebar.map(({ label, Icon, active }) => (
            <span key={label} className={`flex min-h-10 items-center gap-2 rounded-sm px-3 body-5 ${active ? "bg-surface-sunken text-text" : "text-text-subtle"}`}>
              <Icon size={16} aria-hidden /> {label}
            </span>
          ))}
        </nav>
        <div className="min-w-0 lg:col-span-6">
          <ul className="grid grid-cols-2 border-b border-border md:grid-cols-4">
            {kpis.map((k) => (
              <li key={k.label} className="flex flex-col gap-1 border-b border-r border-border p-4 odd:border-r md:border-b-0 md:last:border-r-0">
                <p className="label-caps text-text-subtle">{k.label}</p>
                <p className="heading-4 tnum text-text">{k.value}</p>
                <p className="caption-5 text-text-subtle">{k.note}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline gap-3 px-4 py-3">
            <p className="heading-6 uppercase text-text">Apps</p>
            <p className="caption-2 text-text-subtle">{demoTenant.name}</p>
          </div>
          <ul>
            {demoCrates.map((c) => (
              <li key={c.slug} className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-t border-border px-4 py-3 md:grid-cols-[1fr_auto_4rem_auto] ${c.slug === selected.slug ? "bg-surface-sunken" : ""}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <CrateMonogram name={c.name} />
                  <div className="min-w-0">
                    <p className="title-4 truncate text-text">{c.name}</p>
                    <p className="truncate caption-5 text-text-subtle">{c.publisher}</p>
                  </div>
                </div>
                <span className="hidden font-mono caption-2 text-text md:block">{c.version}</span>
                <span className="hidden w-16 md:block"><BayTrack bays={c.bays} compact /></span>
                <StatusChip status={c.status} label={c.statusLabel} />
              </li>
            ))}
          </ul>
        </div>
        <aside aria-label="Manifest of the selected crate" className="flex min-w-0 flex-col gap-4 border-t border-border p-4 lg:col-span-4 lg:border-l lg:border-t-0 lg:p-6">
          <div>
            <p className="label-caps text-text-subtle">Manifest</p>
            <p className="heading-5 uppercase text-text">{selected.name} {selected.version}</p>
          </div>
          <CrateLabel crate={selected} size="md" className="p-4 md:p-4" />
          <div role="status" className="flex gap-3 rounded-sm border border-warning bg-warning-surface p-3">
            <Warning size={20} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <p className="body-6 text-text"><strong className="font-semibold">Bay 2 paused.</strong> 14% of Pilot devices failed the install, over the 10% threshold. Roll back or review the log.</p>
          </div>
          <CheckChips checks={selected.checks} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-3 button-sm text-action-text"><ArrowsClockwise size={16} aria-hidden /> Roll back to 6.3.0</span>
            <span className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 button-sm text-text">Open QA log</span>
          </div>
          <p className="caption-2 text-text-subtle">Rollback re-assigns 6.3.0 as Required and 6.3.1 as Uninstall for Bay 1. An audit entry is written.</p>
          <InspectionTag checks={selected.checks} className="self-start" />
        </aside>
      </div>
      <DemoNote>Demo data. Not a customer and not real telemetry.</DemoNote>
    </figure>
  );
}
