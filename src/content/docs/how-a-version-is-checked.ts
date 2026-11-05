import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const howChecked: DocPage = {
  slug: "how-a-version-is-checked",
  title: "How a version is checked",
  description: `The four checks ${p.name} runs on every app version before it can reach a device.`,
  sections: [
    {
      heading: "Four checks",
      body: [
        `${p.fullName} puts four checks on every app version. Each version carries an inspection tag showing the result of each one, and the tag links to the QA log.`,
      ],
    },
    {
      heading: "Hash",
      body: ["The installer is downloaded and its SHA-256 is recorded. The same hash is shown on the version label, so you can compare it with the vendor's published value."],
    },
    {
      heading: "Signer",
      body: ["The code signing certificate is read and compared with the signer of earlier versions. A new or changed signer holds the release for manual review."],
    },
    {
      heading: "Scan",
      body: ["The installer is scanned for malware in an isolated sandbox, and a scanner signature database older than 24 hours holds the version. A hit holds the version. The in-house scanner is being commissioned: until it reports on a version, that version does not pass this check and cannot publish. No single scanner catches everything, which is why the Pilot ring exists."],
    },
    {
      heading: "VM",
      body: [
        "The VM check installs, detects and uninstalls the app in a clean Windows VM. Until the Windows test lab is live, this check shows as pending. We never show a VM pass for a test that did not run.",
      ],
    },
    {
      heading: "After the checks",
      body: ["A version that passes goes to Pilot first. Broad follows after the delay, and auto pause stops it if Pilot failures reach the threshold. Rollback is available to the last 3 versions."],
    },
  ],
};
