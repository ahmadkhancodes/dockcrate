import type { GraphAssignment, Intent } from "@/lib/graph/types";

export type DeploymentState = "uploading" | "assigned" | "promoted" | "paused" | "rolled_back" | "failed";
export type UploadStep = "create_app" | "content_version" | "content_file" | "await_sas" | "upload" | "commit" | "await_commit" | "finalize" | "assign" | "done";
export type Variant = "standard" | "update_only" | "esp_fixed";

export interface RingSetting { groupId: string; groupName: string; delayHours: number }

/** Per tenant ring setup. Defaults per the brief: Pilot 0 h, Broad 48 h, pause at 10% failures. */
export interface RingConfig {
  id: string; // tenantId
  orgId: string;
  pilot: RingSetting;
  broad: RingSetting;
  failThresholdPct: number;
  intent: Extract<Intent, "required" | "available">;
  alertEmail: string | null;
  /** Auto update value a newly published app starts with in this tenant (default on). */
  autoUpdateDefault?: boolean;
}

export const DEFAULT_PILOT_DELAY_HOURS = 0;
export const DEFAULT_BROAD_DELAY_HOURS = 48;
export const DEFAULT_FAIL_THRESHOLD_PCT = 10;

export interface TenantApp {
  id: string; // `${tenantId}:${appSlug}`
  orgId: string;
  tenantId: string;
  appSlug: string;
  autoUpdate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  orgId: string;
  tenantId: string;
  appSlug: string;
  versionId: string;
  version: string;
  variant: Variant;
  idempotencyKey: string;
  state: DeploymentState;
  step: UploadStep;
  intuneAppId: string | null;
  contentVersionId: string | null;
  fileId: string | null;
  sasUri: string | null;
  /** Packaged payload kept so an interrupted upload resumes (null forces a re-package). */
  pkg: { path: string; size: number; sizeEncrypted: number; info: import("@/lib/intunewin").FileEncryptionInfo } | null;
  assignments: GraphAssignment[];
  pilotAssignedAt: string | null;
  broadAssignedAt: string | null;
  failurePct: number | null;
  pausedReason: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgSettings { id: string; paused: boolean }
