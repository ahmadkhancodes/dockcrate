/** Client safe labels and types (the main tenants module pulls server only code). */
export type TenantStatus = "pending" | "waiting_consent" | "connected" | "disconnected";
export const STATUS_LABEL: Record<TenantStatus, string> = {
  pending: "Not connected",
  waiting_consent: "Waiting for admin",
  connected: "Connected",
  disconnected: "Disconnected",
};
export type { Tenant } from "./index";
