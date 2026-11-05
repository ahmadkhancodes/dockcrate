import type { DetectionRule } from "@/lib/graph/types";

export type CheckState = "pass" | "pending" | "fail";
export interface Checks { hash: CheckState; signer: CheckState; scan: CheckState; vm: CheckState }
export type VersionStatus = "candidate" | "verified_static" | "verified" | "held" | "revoked";

export interface QaEntry { at: string; step: "hash" | "signer" | "scan" | "vm" | "package"; result: CheckState; message: string }
export interface VerificationRecord { checks: Checks; qaLog: QaEntry[]; heldReason: string | null }

export interface CatalogApp {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  wingetId: string;
  platform: "windows";
  license: string;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogVersion {
  id: string;
  appSlug: string;
  version: string;
  arch: "x64" | "x86" | "arm64";
  installerType: "msi" | "wix" | "nullsoft" | "inno" | "exe" | "msix";
  sha256: string;
  /** Vendor installer URL (reviewed winget manifest). Null for the sample seed: nothing can be downloaded yet. */
  installerUrl?: string | null;
  signer: { subject: string; thumbprint: string };
  previousSignerThumbprint: string | null;
  installCmd: string;
  uninstallCmd: string;
  setupFile: string;
  detection: DetectionRule[];
  minOs: string;
  status: VersionStatus;
  testedAt: string;
  verification: VerificationRecord;
  /** Ed25519 signature over the manifest payload (ManifestSigner). Verified again right before every upload. */
  manifestSig: string | null;
  createdAt: string;
}

export const passedCount = (c: Checks) => Object.values(c).filter((v) => v === "pass").length;
