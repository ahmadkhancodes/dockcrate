/**
 * Illustrative data for the storefront preview surfaces. Every surface that renders this
 * is labelled "Demo data". Never present it as customer or telemetry data.
 */
export type CheckState = "pass" | "pending" | "fail";
export type Checks = { hash: CheckState; signer: CheckState; scan: CheckState; vm: CheckState };
export type BayState = "done" | "active" | "paused" | "idle";
export type Shipment = "shipped" | "bay2-waiting" | "paused" | "held";

export interface DemoCrate {
  slug: string;
  name: string;
  publisher: string;
  version: string;
  arch: string;
  installer: string;
  sha: string;
  checks: Checks;
  bays: [BayState, BayState, BayState];
  status: Shipment;
  statusLabel: string;
}

const all: Checks = { hash: "pass", signer: "pass", scan: "pass", vm: "pass" };

export const demoCrates: DemoCrate[] = [
  { slug: "google-chrome", name: "Google Chrome", publisher: "Google LLC", version: "152.0.6913", arch: "x64", installer: "MSI", sha: "b41e07d2…5ac9", checks: all, bays: ["done", "done", "done"], status: "shipped", statusLabel: "Shipped" },
  { slug: "7-zip", name: "7-Zip", publisher: "Igor Pavlov", version: "25.01", arch: "x64", installer: "MSI", sha: "3f9a1c0e…b27d", checks: all, bays: ["done", "done", "idle"], status: "bay2-waiting", statusLabel: "Bay 2 in 31 h" },
  { slug: "zoom-workplace", name: "Zoom Workplace", publisher: "Zoom Communications", version: "6.3.1", arch: "x64", installer: "MSI", sha: "9c41d7aa…e03f", checks: all, bays: ["done", "paused", "idle"], status: "paused", statusLabel: "Paused" },
  { slug: "notepad-plus-plus", name: "Notepad++", publisher: "Notepad++ Team", version: "8.8.5", arch: "x64", installer: "EXE", sha: "e2d80b61…7714", checks: all, bays: ["done", "done", "done"], status: "shipped", statusLabel: "Shipped" },
  { slug: "adobe-acrobat-reader", name: "Adobe Acrobat Reader", publisher: "Adobe Inc.", version: "25.001.20630", arch: "x64", installer: "EXE", sha: "08fb6a35…c9e1", checks: { hash: "pass", signer: "pass", scan: "pass", vm: "fail" }, bays: ["done", "idle", "idle"], status: "held", statusLabel: "Held in QA" },
  { slug: "vlc-media-player", name: "VLC media player", publisher: "VideoLAN", version: "3.0.21", arch: "x64", installer: "MSI", sha: "6a2c9f10…d3b8", checks: all, bays: ["done", "done", "done"], status: "shipped", statusLabel: "Shipped" },
];

export const demoTenant = { name: "Halvorsen Dental", pilot: "Pilot 0 h", broad: "Broad 48 h" };
export const crateBySlug = (slug: string) => demoCrates.find((c) => c.slug === slug);

/** Last tested dates are sample values. The real catalog stores the real run date. */
export const sampleTested: Record<string, string> = {
  "google-chrome": "2026-11-04", "7-zip": "2026-11-03", "zoom-workplace": "2026-11-04",
  "notepad-plus-plus": "2026-11-02", "adobe-acrobat-reader": "2026-11-01", "vlc-media-player": "2026-10-30",
};

/** Honest state (D-01): nothing in the sample list has run in the Windows lab, so the VM check is pending. */
export const asSample = (c: DemoCrate): DemoCrate => ({ ...c, checks: { ...c.checks, vm: "pending" } });
