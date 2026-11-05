import { inScope, type Membership } from "@/lib/authz";

/** Critical events: each goes to the in-app alert centre and to email (brief item 9). */
export const ALERT_KINDS = ["ring.paused", "tenant.disconnected", "signer.changed", "consent.revoked", "device.grace_ending"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export type Severity = "info" | "warning" | "critical";

export const KIND_LABEL: Record<string, string> = {
  "ring.paused": "Ring paused",
  "tenant.disconnected": "Tenant disconnected",
  "signer.changed": "Signer changed",
  "consent.revoked": "Consent revoked",
  "device.grace_ending": "Device limit grace ending",
};

export interface AlertPrefs {
  /** `${orgId}:${userId}` */
  id: string;
  orgId: string;
  userId: string;
  email: string;
  role: string;
  /** In-app centre. Critical alerts are always shown, this only silences info and warning. */
  inApp: boolean;
  /** Email channel. Off means no email at all, including critical. */
  emailOn: boolean;
  /** "daily": info and warning alerts are batched into one digest. Critical alerts are never delayed. */
  digest: "instant" | "daily";
  /** Per tenant: muted tenants send no email and no non critical in-app alerts to this user. */
  mutedTenants: string[];
  lastDigestAt: string | null;
}

export const prefsId = (orgId: string, userId: string) => `${orgId}:${userId}`;

export const defaultPrefs = (orgId: string, userId: string, email: string, role: string): AlertPrefs => ({
  id: prefsId(orgId, userId), orgId, userId, email, role, inApp: true, emailOn: true, digest: "instant", mutedTenants: [], lastDigestAt: null,
});

export interface Route { inApp: boolean; email: "instant" | "digest" | "none" }

/**
 * The routing matrix. Pure: (alert, one user's preferences, their tenant scope) -> where it goes.
 * - Out of scope tenant: nothing (a scoped technician never hears about other tenants).
 * - In-app: critical always; otherwise the user's in-app preference, unless the tenant is muted.
 * - Email: needs the email channel on and the tenant not muted; critical is instant, others follow the digest setting.
 */
export function routeAlert(alert: { severity: Severity; tenantId: string | null }, prefs: AlertPrefs, membership: Membership): Route {
  if (alert.tenantId && !inScope(membership, alert.tenantId)) return { inApp: false, email: "none" };
  const muted = !!alert.tenantId && prefs.mutedTenants.includes(alert.tenantId);
  const critical = alert.severity === "critical";
  const inApp = critical || (prefs.inApp && !muted);
  if (!prefs.emailOn || muted) return { inApp, email: "none" };
  return { inApp, email: critical || prefs.digest === "instant" ? "instant" : "digest" };
}

export const isUnread = (a: { ackAt?: string | null }) => !a.ackAt;
