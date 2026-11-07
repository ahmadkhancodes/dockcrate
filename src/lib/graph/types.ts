import type { FileEncryptionInfo } from "@/lib/intunewin";

/** Everything DockCrate does against one customer tenant goes through this interface (real client or the test fake). */
export type Intent = "required" | "available" | "uninstall";

export interface GraphAssignment {
  groupId: string;
  intent: Intent;
}

export interface Win32AppBody {
  displayName: string;
  description: string;
  publisher: string;
  displayVersion: string;
  installCommandLine: string;
  uninstallCommandLine: string;
  setupFilePath: string;
  fileName: string;
  minimumSupportedWindowsRelease: string;
  detectionRules: DetectionRule[];
  installExperience: { runAsAccount: "system" | "user"; deviceRestartBehavior: "suppress" | "allow" | "force" };
  returnCodes: { returnCode: number; type: "success" | "softReboot" | "hardReboot" | "retry" | "failed" }[];
  notes: string;
}

export type DetectionRule =
  | { kind: "msiProductCode"; productCode: string; productVersion?: string }
  | { kind: "registry"; keyPath: string; valueName: string; operator: "equal" | "greaterThanOrEqual"; comparisonValue: string }
  | { kind: "file"; path: string; fileOrFolderName: string; operator: "greaterThanOrEqual" | "equal"; comparisonValue: string };

export interface ContentFileState {
  uploadState: "azureStorageUriRequestPending" | "azureStorageUriRequestSuccess" | "commitFilePending" | "commitFileSuccess" | "commitFileFailed";
  azureStorageUri?: string;
}

export interface InstallSummary {
  installed: number;
  failed: number;
  pending: number;
}

export interface TenantOrganization {
  id: string;
  displayName: string;
}

export interface GraphClient {
  /** `GET /organization`: the connect probe. */
  getOrganization(): Promise<TenantOrganization>;
  /** `GET /groups` (Group.Read.All): for picking the Pilot and Broad groups. */
  listGroups(): Promise<{ id: string; displayName: string }[]>;
  createWin32App(body: Win32AppBody): Promise<{ id: string }>;
  createContentVersion(appId: string): Promise<{ id: string }>;
  createContentFile(appId: string, contentVersionId: string, file: { name: string; size: number; sizeEncrypted: number }): Promise<{ id: string }>;
  getContentFile(appId: string, contentVersionId: string, fileId: string): Promise<ContentFileState>;
  /** Uploads the encrypted payload to the Azure SAS URI in blocks, then commits the block list. */
  uploadToStorage(sasUri: string, payloadPath: string): Promise<void>;
  commitContentFile(appId: string, contentVersionId: string, fileId: string, info: FileEncryptionInfo): Promise<void>;
  setCommittedContentVersion(appId: string, contentVersionId: string): Promise<void>;
  /** Replaces the assignment set of the app. */
  assignApp(appId: string, assignments: GraphAssignment[]): Promise<void>;
  getInstallSummary(appId: string): Promise<InstallSummary>;
  deleteApp(appId: string): Promise<void>;
  /** Win32 apps whose displayName equals `name` exactly (crash recovery: finds an app we created but never recorded). */
  findAppsByName(name: string): Promise<{ id: string }[]>;
}

/** Thrown when Graph reports the consent is gone (401/403 with AADSTS7000112/700016/65001, invalid_client). */
export class GraphConsentError extends Error {
  constructor(message = "consent_revoked") {
    super(message);
    this.name = "GraphConsentError";
  }
}

export class GraphError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GraphError";
  }
}

export interface GraphFactory {
  forTenant(entraTenantId: string): GraphClient;
}
