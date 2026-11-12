import { ArrowCounterClockwise, Warning } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import { demoCrates, demoTenant, type CheckState, type Checks } from "@/content/demo";
import { CheckIcon, CrateLabel, CrateMonogram, StatusChip, CheckChips, DemoNote } from "./crate";

/**
 * Demo rows for the hero change sheet. Device counts are illustrative and the sheet is labelled "Demo data".
 * Pilot group 14 devices, Broad group 148 devices.
 */
type Cell = { text: string; tone?: "ok" | "wait" | "bad" | "none" };
interface SheetRow { slug: string; name: string; version: string; checks: Checks; pilot: Cell; broad: Cell; next: string; flag?: boolean }

const PILOT = 14;
const BROAD = 148;
/** The VM check is pending for every version today (D-01), so no demo row may show it as passed. */
const all: Checks = { hash: "pass", signer: "pass", scan: "pass", vm: "pending" };
const byslug = (s: string) => demoCrates.find((c) => c.slug === s)!;

const sheet: SheetRow[] = [
  { slug: "zoom-workplace", name: "Zoom Workplace", version: "6.3.1", checks: all, pilot: { text: `2 of ${PILOT} failed`, tone: "bad" }, broad: { text: "Paused", tone: "wait" }, next: "Roll back to 6.3.0 or review the log", flag: true },
  { slug: "7-zip", name: "7-Zip", version: "25.01", checks: all, pilot: { text: `${PILOT}/${PILOT} installed`, tone: "ok" }, broad: { text: "Waiting", tone: "wait" }, next: "Broad in 31 h" },
  { slug: "google-chrome", name: "Google Chrome", version: "152.0.6913", checks: all, pilot: { text: `${PILOT}/${PILOT} installed`, tone: "ok" }, broad: { text: `147/${BROAD} installed`, tone: "ok" }, next: "Up to date" },
  { slug: "notepad-plus-plus", name: "Notepad++", version: "8.8.5", checks: all, pilot: { text: `${PILOT}/${PILOT} installed`, tone: "ok" }, broad: { text: `146/${BROAD} installed`, tone: "ok" }, next: "Up to date" },
  { slug: "adobe-acrobat-reader", name: "Adobe Acrobat Reader", version: "25.001.20630", checks: byslug("adobe-acrobat-reader").checks, pilot: { text: "Not sent", tone: "none" }, broad: { text: "Not sent", tone: "none" }, next: "Held in QA: signer changed" },
];

const checkNames: [keyof Checks, string][] = [["hash", "Hash"], ["signer", "Signer"], ["scan", "Scan"], ["vm", "VM"]];
const word: Record<CheckState, string> = { pass: "passed", pending: "pending", fail: "failed" };

function ChecksCell({ checks }: { checks: Checks }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={checkNames.map(([k, n]) => `${n} ${word[checks[k]]}`).join(", ")} role="img">
      {checkNames.map(([k]) => <CheckIcon key={k} state={checks[k]} />)}
    </span>
  );
}

const toneCls: Record<NonNullable<Cell["tone"]>, string> = { ok: "text-success", wait: "text-text-subtle", bad: "text-danger", none: "text-text-muted" };

/** Hero visual: the change sheet for one tenant. The paused row wears the teal wash, drawn in once. */
export function HeroDock() {
  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="sr-only">Illustrative change sheet for one client tenant, with demo data</figcaption>
      <div className="overflow-hidden rounded-lg border-2 border-text bg-surface-raised">
        <div className="flex flex-wrap items-stretch justify-between border-b-2 border-text bg-surface-inverse">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 md:px-6">
            <span className="stencil title-1 uppercase text-text-inverse">{demoTenant.name}</span>
            <span className="font-mono caption-4 text-text-inverse-subtle">Change sheet · week 46</span>
          </p>
          <p className="flex items-center px-4 py-3 font-mono caption-4 text-text-inverse-subtle md:px-6">Pilot {PILOT} devices, 0 h · Broad {BROAD} devices, 48 h · pause over 10% failed</p>
        </div>
        <span aria-hidden className="hazard block h-2 border-b-2 border-text" />
        <table className="w-full border-collapse text-left">
          <thead className="max-md:sr-only">
            <tr className="border-b border-border-strong bg-surface-sunken">
              {["App", "Version", "Checks", "Pilot", "Broad", "Next"].map((h, i) => (
                <th key={h} scope="col" className={cn("label-caps px-4 py-2 font-normal text-text-subtle md:first:pl-6 md:last:pr-6", i === 1 && "hidden lg:table-cell")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.map((r, i) => (
              <tr key={r.slug} className={cn(i > 2 && "max-md:hidden!", r.flag && "bg-mark/40 ring-2 ring-inset ring-accent", "border-b border-border last:border-b-0 max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-2")}>
                <th scope="row" className="py-3 font-normal md:px-4 md:py-2 md:pl-6">
                  <span className="flex min-w-0 items-center gap-3">
                    <CrateMonogram name={r.name} />
                    <span className="min-w-0">
                      <span className="block truncate title-4 font-semibold text-text">{r.name}</span>
                      <span className="block font-mono caption-5 text-text-subtle lg:hidden">{r.version}</span>
                    </span>
                  </span>
                </th>
                <td className="hidden px-4 py-2 font-mono caption-2 tnum text-text lg:table-cell">{r.version}</td>
                <td className="self-center md:px-4 md:py-2"><ChecksCell checks={r.checks} /></td>
                <td className={cn("font-mono caption-2 tnum max-md:col-span-2 max-md:before:content-['Pilot_'] md:px-4 md:py-2", toneCls[r.pilot.tone ?? "ok"])}>{r.pilot.text}</td>
                <td className={cn("font-mono caption-2 tnum max-md:col-span-2 max-md:before:content-['Broad_'] md:px-4 md:py-2", toneCls[r.broad.tone ?? "ok"])}>{r.broad.text}</td>
                <td className="max-md:col-span-2 md:px-4 md:py-2 md:pr-6">
                  {r.flag ? (
                    <span className="mark-draw inline-flex items-center gap-2 rounded-sm border border-accent px-2 py-0.5 body-4 text-on-mark">
                      <ArrowCounterClockwise size={14} weight="bold" aria-hidden /> {r.next}
                    </span>
                  ) : (
                    <span className="caption-2 text-text-subtle">{r.next}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DemoNote>Demo data. The tenant, devices and versions are illustrative.</DemoNote>
    </figure>
  );
}

const nav = ["Dock", "Tenants", "MSP view", "App Sets", "Rings", "Audit log", "Settings"];

const kpis = [
  { label: "Out of date", value: "7", note: "across 4 tenants" },
  { label: "Paused rings", value: "1", note: "Zoom 6.3.1, Broad" },
  { label: "Disconnected", value: "1", note: "consent revoked" },
  { label: "Devices", value: "108/250", note: "counted nightly" },
];

/** Dock overview: tenant board, app rows and the manifest of the selected version. */
export function DockOverview() {
  const selected = demoCrates[2]!;
  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="sr-only">Illustrative DockCrate by BufferSol dock overview with demo data</figcaption>
      <div className="grid overflow-hidden rounded-lg border-2 border-text bg-surface-raised lg:grid-cols-12">
        <nav aria-label="Demo sidebar" className="hidden flex-col border-r border-border bg-surface py-3 lg:col-span-2 lg:flex">
          <p className="px-4 pb-3 font-mono caption-4 text-text-subtle">Northbay IT</p>
          {nav.map((label, i) => (
            <span key={label} className={cn("mx-2 flex min-h-10 items-center border-2 px-2 body-5", i === 0 ? "border-accent bg-surface-raised font-semibold text-text" : "border-transparent text-text-subtle")}>
              {label}
            </span>
          ))}
        </nav>
        <div className="min-w-0 lg:col-span-6">
          <dl className="grid grid-cols-2 border-b border-border md:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="flex flex-col gap-1 border-b border-r border-border p-4 even:border-r-0 md:border-b-0 md:even:border-r md:last:border-r-0">
                <dt className="label-caps text-text-subtle">{k.label}</dt>
                <dd className="figure-md text-text">{k.value}</dd>
                <dd className="font-mono caption-5 text-text-muted">{k.note}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-baseline justify-between gap-3 px-4 py-3">
            <p className="title-4 font-semibold text-text">Apps in {demoTenant.name}</p>
            <p className="font-mono caption-5 text-text-muted">6 apps</p>
          </div>
          <ul>
            {demoCrates.map((c) => (
              <li key={c.slug} className={cn("grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-t border-border px-4 py-2 md:grid-cols-[1fr_7rem_auto]", c.slug === selected.slug && "bg-surface-sunken")}>
                <div className="flex min-w-0 items-center gap-3">
                  <CrateMonogram name={c.name} />
                  <div className="min-w-0">
                    <p className="title-4 truncate text-text">{c.name}</p>
                    <p className="truncate caption-5 text-text-subtle">{c.publisher}</p>
                  </div>
                </div>
                <span className="hidden truncate font-mono caption-2 tnum text-text md:block">{c.version}</span>
                <StatusChip status={c.status} label={c.statusLabel} />
              </li>
            ))}
          </ul>
        </div>
        <aside aria-label="Manifest of the selected version" className="flex min-w-0 flex-col gap-4 border-t border-border p-4 lg:col-span-4 lg:border-l lg:border-t-0 lg:p-6">
          <CrateLabel crate={selected} size="md" />
          <div role="status" className="flex gap-3 rounded-md border border-warning bg-warning-surface p-3">
            <Warning size={20} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <p className="body-6 text-text"><strong className="font-semibold">Broad paused.</strong> 14% of Pilot devices failed the install, over the 10% threshold. Roll back or review the log.</p>
          </div>
          <CheckChips checks={selected.checks} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-3 button-sm text-action-text"><ArrowCounterClockwise size={16} aria-hidden /> Roll back to 6.3.0</span>
            <span className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 button-sm text-text">Open QA log</span>
          </div>
          <p className="caption-2 text-text-subtle">Rollback assigns 6.3.0 as Required and 6.3.1 as Uninstall for Pilot. An audit entry is written.</p>
        </aside>
      </div>
      <DemoNote>Demo data. Not a customer and not real telemetry.</DemoNote>
    </figure>
  );
}
