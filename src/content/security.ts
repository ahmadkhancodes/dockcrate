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
  { name: "Scan", rule: "Malware scan in an isolated sandbox. A detection or a signature database older than 24 h holds publication." },
  { name: "VM", rule: "Installed, detected, launched and uninstalled in a clean Windows VM." },
];

export const vmPendingNote =
  "While our Windows test lab is being commissioned, the VM check shows as pending on any version it has not tested, and those versions publish to Pilot only.";

/** Data handling statement (security page). Matches the privacy policy and DPA. */
export const dataHandling: string[] = [
  "We store tenant IDs, group and device identifiers returned by Microsoft Graph, app and ring metadata, and an audit log. We do not store device contents, user files or user passwords.",
  "We never hold a customer secret: access to your tenant uses our own app credential with the application permissions your Global Admin granted, and you can revoke consent in Entra at any time.",
  "Installers are downloaded from the vendor, hashed, scanned and uploaded straight to your Intune tenant. We keep the hash, the signer and the QA log, not a copy of your fleet.",
  "The audit log is append only and tamper evident: each entry stores the hash of the one before it, and an owner or admin can verify the whole chain from the audit log page. This detects edited, removed or reordered entries; it cannot detect deletion of the very newest entries, so export the log regularly if you need that.",
  "Data is hosted in the United States today (sub processors below). A UK data region is on the roadmap, not live.",
  "On account deletion we remove tenant, ring and billing data. Audit entries keep ids only, as the privacy policy says.",
];
