import type { DeviceCount } from "@/lib/billing/devices";
import type { CatalogEntry } from "@/lib/catalog";
import type { Deployment } from "@/lib/rings/types";
import { dockRows } from "@/lib/rings/view";
import type { Alert, Tenant } from "@/lib/tenants";

export type MspKind = "all" | "outdated" | "paused" | "disconnected";
export const MSP_KINDS: { value: MspKind; label: string }[] = [
  { value: "all", label: "Everything" }, { value: "outdated", label: "Out of date" }, { value: "paused", label: "Paused rings" }, { value: "disconnected", label: "Disconnected" },
];

export interface MspFilter { tenant?: string; kind?: MspKind; q?: string }
export interface AppIssue { tenantId: string; tenantName: string; slug: string; appName: string; deployed: string; latest: string; reason: string | null }
export interface TenantIssue { id: string; name: string; status: Tenant["status"]; paused: boolean; lastError: string | null; devices: number | null; countedAt: string | null; alerts: number }

export interface MspOverview {
  outdated: AppIssue[];
  paused: AppIssue[];
  /** Tenants that are not connected, or are paused by an operator. */
  disconnected: TenantIssue[];
  /** Every tenant in scope with its device count (the device table). */
  tenants: TenantIssue[];
  totals: { tenants: number; devices: number; outdated: number; paused: number; disconnected: number };
}

export function parseMspFilter(sp: Record<string, string | string[] | undefined>): MspFilter {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  const kind = one(sp.kind);
  return { tenant: one(sp.tenant), kind: MSP_KINDS.some((k) => k.value === kind) ? (kind as MspKind) : "all", q: one(sp.q)?.slice(0, 80) };
}

/** Cross tenant view for an MSP: what is behind, what is paused, which tenants are unreachable. Pure; the caller passes only tenants in scope. */
export function mspOverview(input: { tenants: Tenant[]; deployments: Deployment[]; entries: CatalogEntry[]; deviceCounts: DeviceCount[]; alerts: Alert[] }, f: MspFilter = {}, now = Date.now()): MspOverview {
  const q = f.q?.toLowerCase();
  const counts = new Map(input.deviceCounts.map((c) => [c.id, c]));
  const scoped = input.tenants.filter((t) => !f.tenant || t.id === f.tenant);
  const issues: AppIssue[] = [];
  const paused: AppIssue[] = [];
  for (const t of scoped) {
    for (const r of dockRows(input.entries, input.deployments.filter((d) => d.tenantId === t.id), null, now)) {
      if (!r.deployedVersion) continue;
      const row: AppIssue = { tenantId: t.id, tenantName: t.name, slug: r.slug, appName: r.name, deployed: r.deployedVersion, latest: r.catalogVersion, reason: r.pausedReason };
      if (q && !`${t.name} ${r.name}`.toLowerCase().includes(q)) continue;
      if (r.paused) paused.push(row);
      else if (r.outOfDate) issues.push(row);
    }
  }
  const tenantRow = (t: Tenant): TenantIssue => ({ id: t.id, name: t.name, status: t.status, paused: t.paused, lastError: t.lastError, devices: counts.get(t.id)?.count ?? null, countedAt: counts.get(t.id)?.countedAt ?? null, alerts: input.alerts.filter((a) => a.tenantId === t.id).length });
  const tenants = scoped.filter((t) => !q || t.name.toLowerCase().includes(q)).map(tenantRow).sort((a, b) => a.name.localeCompare(b.name));
  const disconnected = tenants.filter((t) => t.status !== "connected" || t.paused);
  const show = (k: MspKind) => !f.kind || f.kind === "all" || f.kind === k;
  const out = {
    outdated: show("outdated") ? issues : [], paused: show("paused") ? paused : [], disconnected: show("disconnected") ? disconnected : [], tenants,
    totals: { tenants: tenants.length, devices: tenants.reduce((n, t) => n + (t.devices ?? 0), 0), outdated: issues.length, paused: paused.length, disconnected: disconnected.length },
  };
  return out;
}
