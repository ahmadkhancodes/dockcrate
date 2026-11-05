import type { DemoCrate, Shipment } from "@/content/demo";
import { publishPlan } from "./verify";
import type { CatalogEntry } from "./index";

/** Serializable row for the public catalog list and the dashboard. */
export interface CatalogRow {
  slug: string;
  name: string;
  publisher: string;
  version: string;
  versionId: string;
  checks: CatalogEntry["version"]["verification"]["checks"];
  testedAt: string;
  tag: string;
  category: string;
  status: CatalogEntry["version"]["status"];
  /** True until the live pipeline produced the version: seed rows carry no vendor installer URL. */
  demo: boolean;
}

export const isDemoVersion = (v: { installerUrl?: string | null }) => !v.installerUrl;

export const toRow = (e: CatalogEntry): CatalogRow => ({
  slug: e.app.slug, name: e.app.name, publisher: e.app.publisher, version: e.version.version, versionId: e.version.id,
  checks: e.version.verification.checks, testedAt: e.version.testedAt, tag: publishPlan(e.version).tag,
  category: e.app.category ?? "Other", status: e.version.status, demo: isDemoVersion(e.version),
});

/** Adapter for the CrateLabel component, which renders a crate-shaped view model. */
export function toCrate(e: CatalogEntry, status: Shipment = "shipped", statusLabel = ""): DemoCrate {
  const s = e.version.sha256;
  return {
    slug: e.app.slug, name: e.app.name, publisher: e.app.publisher, version: e.version.version, arch: e.version.arch,
    installer: e.version.installerType === "msi" || e.version.installerType === "wix" ? "MSI" : "EXE", sha: `${s.slice(0, 8)}…${s.slice(-4)}`,
    checks: e.version.verification.checks, bays: ["idle", "idle", "idle"], status, statusLabel,
  };
}
