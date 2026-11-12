import { csvCell } from "@/lib/audit-export";
import type { DockRow } from "@/lib/rings/view";

export const DOCK_CSV_HEADER = ["app", "publisher", "catalog_version", "deployed_version", "status", "out_of_date", "paused", "paused_reason"] as const;

/** The dock of one tenant as CSV (spreadsheet formula cells are neutralised by csvCell). */
export function dockCsv(rows: DockRow[]): string {
  const body = rows.map((r) => [r.name, r.publisher, r.catalogVersion, r.deployedVersion ?? "", r.statusLabel, r.outOfDate ? "yes" : "no", r.paused ? "yes" : "no", r.pausedReason ?? ""]);
  return [DOCK_CSV_HEADER as readonly string[], ...body].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
