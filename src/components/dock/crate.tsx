import type { ReactNode } from "react";
import { Check, Clock, Pause, Warning, X, Hourglass } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import type { BayState, CheckState, Checks, DemoCrate, Shipment } from "@/content/demo";

const checkList: { key: keyof Checks; label: string }[] = [
  { key: "hash", label: "Hash" },
  { key: "signer", label: "Signer" },
  { key: "scan", label: "Scan" },
  { key: "vm", label: "VM" },
];

export const passed = (c: Checks) => Object.values(c).filter((v) => v === "pass").length;

function CheckIcon({ state }: { state: CheckState }) {
  if (state === "pass") return <Check size={12} weight="bold" aria-hidden className="text-success" />;
  if (state === "fail") return <X size={12} weight="bold" aria-hidden className="text-danger" />;
  return <Hourglass size={12} weight="bold" aria-hidden className="text-warning" />;
}

const stateWord: Record<CheckState, string> = { pass: "passed", pending: "pending", fail: "failed" };

/** The four punched checks. Status is icon plus label, never colour alone. */
export function CheckChips({ checks }: { checks: Checks }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {checkList.map((c) => (
        <li key={c.key} className="inline-flex min-h-6 items-center gap-1 rounded-sm border border-border-strong bg-surface-raised px-2 caption-3 text-text">
          <CheckIcon state={checks[c.key]} />
          {c.label}
          <span className="sr-only"> {stateWord[checks[c.key]]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Amber inspection tag with a punched hole. Black text on amber only. */
export function InspectionTag({ checks, className }: { checks: Checks; className?: string }) {
  const n = passed(checks);
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-sm bg-amber px-2 py-0.5 caption-3 uppercase tracking-wide text-on-amber", className)}>
      <span aria-hidden className="size-2 rounded-full border border-on-amber" />
      {n === 4 ? "Inspected" : "Inspection"} <span className="tnum">{n}/4</span>
    </span>
  );
}

/** The crate label: dashed stencilled box with name, version, architecture and SHA-256 prefix. */
export function CrateLabel({ crate, size = "lg", className }: { crate: DemoCrate; size?: "lg" | "md"; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-sm border-2 border-dashed border-text bg-surface-raised p-4 md:p-6", className)}>
      <div className={cn("flex gap-4", size === "lg" ? "items-start justify-between" : "flex-col")}>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="label-caps text-text-subtle">Crate · Windows {crate.arch}</p>
          <p className={cn("min-w-0 break-words text-text", size === "lg" ? "stencil-lg" : "stencil-md")}>
            {crate.name} {crate.version}
          </p>
        </div>
        <InspectionTag checks={crate.checks} className="shrink-0 self-start" />
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono caption-2 text-text-subtle">
        <span>SHA-256 {crate.sha}</span>
        <span>{crate.publisher}</span>
        <span>{crate.installer}</span>
      </p>
      <CheckChips checks={crate.checks} />
    </div>
  );
}

const segment: Record<BayState, string> = {
  done: "bg-action",
  active: "bg-action",
  paused: "bg-warning",
  idle: "bg-border",
};
const segmentName = ["Dock", "Bay 1", "Bay 2"];

/** Segmented ring progress: dock, Bay 1 (Pilot), Bay 2 (Broad). */
export function BayTrack({ bays, className, compact }: { bays: [BayState, BayState, BayState]; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="grid grid-cols-3 gap-1" role="img" aria-label={bays.map((b, i) => `${segmentName[i]} ${b === "done" ? "reached" : b === "paused" ? "paused" : "not reached"}`).join(", ")}>
        {bays.map((b, i) => (
          <span key={i} className={cn("h-2", segment[b])} />
        ))}
      </div>
      {compact ? null : <div aria-hidden className="grid grid-cols-3 gap-1 label-caps text-text-subtle">
        {segmentName.map((n) => <span key={n}>{n}</span>)}
      </div>}
    </div>
  );
}

const chipTone: Record<Shipment, { cls: string; icon: ReactNode }> = {
  shipped: { cls: "border-success text-success", icon: <Check size={14} weight="bold" aria-hidden /> },
  "bay2-waiting": { cls: "border-border-strong text-text", icon: <Clock size={14} weight="bold" aria-hidden /> },
  paused: { cls: "border-warning text-warning", icon: <Pause size={14} weight="bold" aria-hidden /> },
  held: { cls: "border-danger text-danger", icon: <Warning size={14} weight="bold" aria-hidden /> },
};

export function StatusChip({ status, label }: { status: Shipment; label: string }) {
  const t = chipTone[status];
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-sm border bg-surface-raised px-2 caption-3", t.cls)}>
      {t.icon}
      {label}
    </span>
  );
}

export function CrateMonogram({ name }: { name: string }) {
  return (
    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border-2 border-text bg-surface-raised stencil-md text-text">
      {name.charAt(0)}
    </span>
  );
}

export function DemoNote({ children = "Demo data. Tenants and versions in this preview are illustrative." }: { children?: ReactNode }) {
  return <p className="caption-2 text-text-subtle">{children}</p>;
}
