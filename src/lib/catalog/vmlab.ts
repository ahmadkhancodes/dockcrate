import type { DetectionRule } from "@/lib/graph/types";
import type { CheckState } from "./types";

/** D-01: the Windows VM install, detect and uninstall test. Adapter `PendingVmLab` now, `ProxmoxVmLab` on the VPS. */
export interface VmLabInput {
  versionId: string;
  installerUrl: string | null;
  installCmd: string;
  uninstallCmd: string;
  detection: DetectionRule[];
}
export interface VmLabResult { result: CheckState; log: string[] }
export interface VmLab {
  readonly name: string;
  run(input: VmLabInput): Promise<VmLabResult>;
}

/** No lab attached: the vm step is recorded as pending and nothing is claimed. */
export class PendingVmLab implements VmLab {
  readonly name = "pending";
  async run(): Promise<VmLabResult> {
    return { result: "pending", log: ["No Windows test lab is attached. The VM install and detection test has not run."] };
  }
}
