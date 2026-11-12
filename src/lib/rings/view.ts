import type { Shipment, BayState } from "@/content/demo";
import { publishPlan } from "@/lib/catalog/verify";
import type { CatalogEntry } from "@/lib/catalog";
import type { Deployment, RingConfig } from "./types";

export interface DockRow {
  slug: string;
  name: string;
  publisher: string;
  catalogVersion: string;
  deployedVersion: string | null;
  checks: CatalogEntry["version"]["verification"]["checks"];
  tag: string;
  bays: [BayState, BayState, BayState];
  status: Shipment;
  statusLabel: string;
  outOfDate: boolean;
  paused: boolean;
  deploymentId: string | null;
  /** Earlier deployment the Roll back button restores, if any (last 3). */
  rollbackTo: { id: string; version: string } | null;
  pausedReason: string | null;
  canPublish: boolean;
  publishReason: string | null;
}

const ACTIVE = ["assigned", "promoted", "paused"];

/** Pure view model for one tenant: catalog entries joined with the tenant's deployments. */
export function dockRows(entries: CatalogEntry[], deployments: Deployment[], config: RingConfig | null, now = Date.now()): DockRow[] {
  return entries.map((e) => {
    const mine = deployments.filter((d) => d.appSlug === e.app.slug && d.step === "done").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const active = mine.find((d) => ACTIVE.includes(d.state)) ?? null;
    const plan = publishPlan(e.version);
    const base = {
      slug: e.app.slug, name: e.app.name, publisher: e.app.publisher, catalogVersion: e.version.version, checks: e.version.verification.checks, tag: plan.tag,
      deployedVersion: active?.version ?? null, outOfDate: !!active && active.versionId !== e.version.id, paused: active?.state === "paused",
      deploymentId: active?.id ?? null, pausedReason: active?.pausedReason ?? null,
      rollbackTo: active ? (mine.filter((d) => d.id !== active.id && d.createdAt < active.createdAt && !!d.intuneAppId).slice(0, 3)[0] ?? null) : null,
      canPublish: plan.allowed && !active || (plan.allowed && !!active && active.versionId !== e.version.id), publishReason: plan.reason,
    };
    const rb = base.rollbackTo ? { id: base.rollbackTo.id, version: base.rollbackTo.version } : null;
    if (!active) {
      const held = e.version.status === "held" || e.version.status === "revoked";
      return { ...base, rollbackTo: rb, bays: ["idle", "idle", "idle"] as DockRow["bays"], status: held ? "held" as const : "bay2-waiting" as const, statusLabel: held ? "Held in QA" : "Not published" };
    }
    if (active.state === "paused") return { ...base, rollbackTo: rb, bays: ["done", "paused", "idle"] as DockRow["bays"], status: "paused" as const, statusLabel: "Paused" };
    if (active.state === "promoted") return { ...base, rollbackTo: rb, bays: ["done", "done", "done"] as DockRow["bays"], status: "shipped" as const, statusLabel: "Shipped" };
    let label = "Broad pending";
    if (!plan.rings.includes("broad")) label = "Pilot only";
    else if (config && active.pilotAssignedAt) {
      const left = Math.max(0, Math.ceil((new Date(active.pilotAssignedAt).getTime() + config.broad.delayHours * 3_600_000 - now) / 3_600_000));
      label = `Broad in ${left} h`;
    }
    return { ...base, rollbackTo: rb, bays: ["done", "done", "idle"] as DockRow["bays"], status: "bay2-waiting" as const, statusLabel: label };
  });
}
