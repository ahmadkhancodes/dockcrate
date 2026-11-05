/** Security page and landing trust band: permission list and QA pipeline. Facts from docs/brief.md only. */
export interface Permission {
  name: string;
  allows: string;
  doesNot: string;
}

export const permissions: Permission[] = [
  {
    name: "DeviceManagementApps.ReadWrite.All",
    allows: "Create, update and assign the Win32 apps we publish, upload their packages, and read install status.",
    doesNot:
      "Touch device configuration, compliance or Conditional Access policy, or run any action on a device. Graph cannot scope this permission to our apps alone, so we only modify apps whose name starts with \"DC |\".",
  },
  {
    name: "DeviceManagementManagedDevices.Read.All",
    allows: "Read the device list and detected apps to count devices nightly for billing and to suggest your starter set.",
    doesNot: "Write anything, or wipe, retire, sync or reset a device.",
  },
  {
    name: "Group.Read.All",
    allows: "Read group names so you can pick your Pilot and Broad groups.",
    doesNot: "Create, edit or delete groups, or change who is in them.",
  },
];

export interface QaStage {
  name: string;
  rule: string;
}

export const qaStages: QaStage[] = [
  { name: "Hash", rule: "The installer SHA-256 must match the manifest." },
  { name: "Signer", rule: "Same signer as the previous version, or the version is held for manual review." },
  { name: "Scan", rule: "Scanned in house with two engines. Stale signatures hold publication." },
  { name: "VM", rule: "Installed, detected, launched and uninstalled in a clean Windows VM." },
];

export const vmPendingNote =
  "While our Windows test lab is being commissioned, the VM check shows as pending on any version it has not tested, and those versions publish to Pilot only.";
