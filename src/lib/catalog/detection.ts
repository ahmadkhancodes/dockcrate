import type { DetectionRule } from "@/lib/graph/types";

export interface DetectionHint {
  msiProductCode?: string;
  uninstallKey?: string;
  displayVersion?: string;
  filePath?: string;
  fileName?: string;
}

/**
 * Auto generated detection rules (ARCHITECTURE 3.2): MSI and WiX use the product code; EXE installers prefer the
 * Apps and Features registry entry (DisplayVersion), else a file version rule on the installed path.
 * Returns an empty list (the version stays unpublishable) when the hint cannot produce a rule. Never guessed.
 */
export function generateDetectionRules(installerType: string, version: string, hint: DetectionHint): DetectionRule[] {
  if ((installerType === "msi" || installerType === "wix") && hint.msiProductCode) return [{ kind: "msiProductCode", productCode: hint.msiProductCode, productVersion: version }];
  if (hint.uninstallKey) return [{ kind: "registry", keyPath: hint.uninstallKey, valueName: "DisplayVersion", operator: "greaterThanOrEqual", comparisonValue: hint.displayVersion ?? version }];
  if (hint.filePath && hint.fileName) return [{ kind: "file", path: hint.filePath, fileOrFolderName: hint.fileName, operator: "greaterThanOrEqual", comparisonValue: version }];
  return [];
}
