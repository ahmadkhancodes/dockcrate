import { auditVisible, type Membership } from "@/lib/authz";
import { can } from "@/lib/auth/roles";
import type { AuditEntry } from "@/lib/db/types";

/**
 * What one member may take out of an organisation in "Export my data" (SECURITY-REVIEW S-4). The export used to hand
 * every member the org's whole audit log (other members' IPs, out of scope tenants) and billing account, so a viewer
 * or a tenant scoped technician could read what their role hides in the app. Each part now follows the same
 * permission the app uses for it.
 */
export function scopeOrgExport(data: Record<string, unknown>, m: Membership): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (can(m.role, "billing", "read")) {
    out.entitlement = data.entitlement ?? null;
    if (can(m.role, "billing", "manage")) out.billingAccount = data.billingAccount ?? null;
  }
  if (can(m.role, "webhook", "read")) out.webhookEndpoints = data.webhookEndpoints ?? [];
  if (can(m.role, "audit", "read")) out.auditLog = ((data.auditLog as AuditEntry[] | undefined) ?? []).filter((e) => auditVisible(m, e));
  return out;
}
