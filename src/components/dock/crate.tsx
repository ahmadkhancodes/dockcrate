import type { ReactNode } from "react";
import { Check, Clock, Pause, Warning, X, Hourglass } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import type { BayState, CheckState, Checks, DemoCrate, Shipment } from "@/content/demo";

/**
 * Release evidence parts in the "change sheet" style (docs/design-brief.md section 6):
 * hairline rules, mono identifiers, status as icon plus word, the lime mark only for what needs a human.
 */

const checkList: { key: keyof Checks; label: string }[] = [
  { key: "hash", label: "Hash" },
  { key: "signer", label: "Signer" },
  { key: "scan", label: "Scan" },
  { key: "vm", label: "VM" },
];

export const passed = (c: Checks) => Object.values(c).filter((v) => v === "pass").length;

export function CheckIcon({ state, size = 14 }: { state: CheckState; size?: number }) {
  if (state === "pass") return <Check size={size} weight="bold" aria-hidden className="shrink-0 text-success" />;
  if (state === "fail") return <X size={size} weight="bold" aria-hidden className="shrink-0 text-danger" />;
  return <Hourglass size={size} weight="bold" aria-hidden className="shrink-0 text-warning" />;
}

const stateWord: Record<CheckState, string> = { pass: "passed", pending: "pending", fail: "failed" };

/** The four checks as a ruled inline list. Status is icon plus label, never colour alone. */
export function CheckChips({ checks }: { checks: Checks }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {checkList.map((c) => (
        <li key={c.key} className="inline-flex min-h-6 items-center gap-1 font-mono caption-4 text-text">
          <CheckIcon state={checks[c.key]} />
          {c.label}
          <span className="sr-only"> {stateWord[checks[c.key]]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Check count stamp: "Checks 4/4". Square, mono, bordered. */
export function InspectionTag({ checks, className }: { checks: Checks; className?: string }) {
  const n = passed(checks);
  const failed = Object.values(checks).includes("fail");
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-sm border px-2 font-mono caption-4", n === 4 ? "border-success text-success" : failed ? "border-danger text-danger" : "border-border-strong text-text-subtle", className)}>
      {n === 4 ? <Check size={12} weight="bold" aria-hidden /> : <Hourglass size={12} weight="bold" aria-hidden />}
      {n === 4 ? "Inspected" : "Checks"} <span className="tnum">{n}/4</span>
    </span>
  );
}

/** The release sheet: name and version as the header, ticket fields in mono, then the checks. */
export function CrateLabel({ crate, size = "lg", className }: { crate: DemoCrate; size?: "lg" | "md"; className?: string }) {
  const fields: [string, string][] = [["SHA-256", crate.sha], ["Publisher", crate.publisher], ["Installer", crate.installer], ["Arch", `Windows ${crate.arch}`]];
  return (
    <div className={cn("flex flex-col rounded-lg border border-border-strong bg-surface-raised", className)}>
      <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border", size === "lg" ? "p-4 md:p-6" : "p-4")}>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="label-caps text-text-subtle">Release</p>
          <p className={cn("min-w-0 break-words text-text", size === "lg" ? "heading-5 md:heading-4" : "heading-6")}>
            {crate.name} <span className="font-mono tnum">{crate.version}</span>
          </p>
        </div>
        <InspectionTag checks={crate.checks} className="shrink-0" />
      </div>
      <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3", size === "lg" ? "p-4 md:px-6" : "p-4")}>
        {fields.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="label-caps text-text-muted">{k}</dt>
            <dd className="truncate font-mono caption-2 text-text">{v}</dd>
          </div>
        ))}
      </dl>
      <div className={cn("border-t border-border", size === "lg" ? "px-4 py-3 md:px-6" : "px-4 py-3")}>
        <CheckChips checks={crate.checks} />
      </div>
    </div>
  );
}

const segment: Record<BayState, string> = {
  done: "bg-text",
  active: "bg-text",
  paused: "bg-warning",
  idle: "bg-border",
};
const segmentName = ["Ready", "Pilot", "Broad"];

/** Ring progress: ready, Pilot, Broad. */
export function BayTrack({ bays, className, compact }: { bays: [BayState, BayState, BayState]; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="grid grid-cols-3 gap-0.5" role="img" aria-label={bays.map((b, i) => `${segmentName[i]} ${b === "done" ? "reached" : b === "paused" ? "paused" : "not reached"}`).join(", ")}>
        {bays.map((b, i) => (
          <span key={i} className={cn("h-1", segment[b])} />
        ))}
      </div>
      {compact ? null : <div aria-hidden className="grid grid-cols-3 gap-0.5 font-mono caption-5 text-text-muted">
        {segmentName.map((n) => <span key={n}>{n}</span>)}
      </div>}
    </div>
  );
}

const chipTone: Record<Shipment, { cls: string; icon: ReactNode }> = {
  shipped: { cls: "text-success", icon: <Check size={14} weight="bold" aria-hidden /> },
  "bay2-waiting": { cls: "text-text", icon: <Clock size={14} weight="bold" aria-hidden /> },
  paused: { cls: "bg-mark text-on-mark", icon: <Pause size={14} weight="bold" aria-hidden /> },
  held: { cls: "text-danger", icon: <Warning size={14} weight="bold" aria-hidden /> },
};

/** Ring status as icon plus word. A paused ring wears the lime mark: it is the one thing that needs a human. */
export function StatusChip({ status, label }: { status: Shipment; label: string }) {
  const t = chipTone[status];
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-sm px-2 caption-3", t.cls)}>
      {t.icon}
      {label}
    </span>
  );
}

/** App initial in a small square, mono. Stands in for vendor icons we do not have rights to show. */
export function CrateMonogram({ name }: { name: string }) {
  return (
    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface font-mono button-sm text-text">
      {name.charAt(0)}
    </span>
  );
}

export function DemoNote({ children = "Demo data. Tenants and versions in this preview are illustrative." }: { children?: ReactNode }) {
  return <p className="caption-2 text-text-muted">{children}</p>;
}
