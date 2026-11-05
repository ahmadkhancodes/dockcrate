import { requireVmVerification } from "@/lib/env";
import { passedCount, type CatalogVersion, type Checks, type QaEntry, type VersionStatus } from "./types";
import type { VmLab } from "./vmlab";

export type Ring = "pilot" | "broad";

/** Status from the four checks. Any failure holds. Without a VM pass the version is verified_static, or held when the VM check is required. */
export function statusFromChecks(c: Checks, requireVm: boolean): VersionStatus {
  if (c.hash === "fail" || c.signer === "fail" || c.scan === "fail" || c.vm === "fail") return "held";
  if (c.hash !== "pass" || c.signer !== "pass" || c.scan !== "pass") return "candidate";
  if (c.vm === "pass") return "verified";
  return requireVm ? "held" : "verified_static";
}

export interface PublishPlan {
  allowed: boolean;
  /** Rings the version may reach. Pilot only while the VM check is pending (D-01). */
  rings: Ring[];
  tag: string;
  reason: string | null;
}

/** The gate every publish and promotion goes through (REQUIRE_VM_VERIFICATION flag, default off). */
export function publishPlan(v: Pick<CatalogVersion, "status" | "verification" | "detection">, requireVm = requireVmVerification()): PublishPlan {
  const n = passedCount(v.verification.checks);
  const checks = v.verification.checks;
  if (v.detection.length === 0) return { allowed: false, rings: [], tag: `Inspection ${n}/4`, reason: "No detection rule could be generated, so the version is not publishable." };
  if (v.status === "revoked") return { allowed: false, rings: [], tag: "Revoked", reason: "This version was revoked." };
  if (v.status === "held" || checks.hash === "fail" || checks.signer === "fail" || checks.scan === "fail" || checks.vm === "fail")
    return { allowed: false, rings: [], tag: `Held ${n}/4`, reason: v.verification.heldReason ?? "A check failed or is required before publishing." };
  if (checks.vm === "pass" && checks.hash === "pass" && checks.signer === "pass" && checks.scan === "pass") return { allowed: true, rings: ["pilot", "broad"], tag: "Inspected 4/4", reason: null };
  if (checks.hash === "pass" && checks.signer === "pass" && checks.scan === "pass") {
    if (requireVm) return { allowed: false, rings: [], tag: "Inspection 3/4 · VM pending", reason: "The VM check is required and has not passed." };
    return { allowed: true, rings: ["pilot"], tag: "Inspection 3/4 · VM pending", reason: "Publishes to Pilot only until a Windows test lab is attached." };
  }
  return { allowed: false, rings: [], tag: `Inspection ${n}/4`, reason: "Static checks have not all passed." };
}

export interface Evidence {
  observedSha256: string;
  signerThumbprint: string;
  /** ClamAV (or any engine) result and the age of its signature database. */
  scan: { clean: boolean; signatureAgeHours: number; detail?: string };
}

export const SCAN_MAX_SIGNATURE_AGE_HOURS = 24;

/** hash, signer, scan from evidence collected by the downloader and Sandbox (not built here), plus the VmLab step. */
export async function verifyVersion(v: CatalogVersion, ev: Evidence, lab: VmLab, now = new Date(), requireVm = requireVmVerification()): Promise<CatalogVersion> {
  const at = now.toISOString();
  const log: QaEntry[] = [];
  const checks: Checks = { hash: "pass", signer: "pass", scan: "pass", vm: "pending" };
  let held: string | null = null;

  if (ev.observedSha256.toLowerCase() !== v.sha256.toLowerCase()) {
    checks.hash = "fail";
    held = "The installer hash does not match the manifest.";
    log.push({ at, step: "hash", result: "fail", message: held });
  } else log.push({ at, step: "hash", result: "pass", message: "Installer SHA-256 matches the manifest." });

  if (v.previousSignerThumbprint && v.previousSignerThumbprint !== ev.signerThumbprint) {
    checks.signer = "fail";
    held ??= "The signing certificate changed from the previous version. Held for manual review.";
    log.push({ at, step: "signer", result: "fail", message: "Signer differs from the last verified version." });
  } else log.push({ at, step: "signer", result: "pass", message: "Signer matches the previous version." });

  if (ev.scan.signatureAgeHours > SCAN_MAX_SIGNATURE_AGE_HOURS) {
    checks.scan = "fail";
    held ??= "The scanner signature database is older than 24 hours, so publication is held.";
    log.push({ at, step: "scan", result: "fail", message: `Signature database is ${ev.scan.signatureAgeHours} h old (limit ${SCAN_MAX_SIGNATURE_AGE_HOURS} h).` });
  } else if (!ev.scan.clean) {
    checks.scan = "fail";
    held ??= `The scan reported a detection${ev.scan.detail ? `: ${ev.scan.detail}` : ""}.`;
    log.push({ at, step: "scan", result: "fail", message: held });
  } else log.push({ at, step: "scan", result: "pass", message: "Scanned. No detections." });

  const vm = await lab.run({ versionId: v.id, installerUrl: null, installCmd: v.installCmd, uninstallCmd: v.uninstallCmd, detection: v.detection });
  checks.vm = vm.result;
  for (const m of vm.log) log.push({ at, step: "vm", result: vm.result, message: m });
  if (vm.result === "fail") held ??= "The Windows VM install or detection test failed.";

  const status = statusFromChecks(checks, requireVm);
  return { ...v, status, testedAt: at.slice(0, 10), verification: { checks, qaLog: log, heldReason: status === "held" ? held ?? "The VM check is required and has not passed." : null } };
}
