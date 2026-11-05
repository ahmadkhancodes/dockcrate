import { can, type OrgRole, type statements } from "@/lib/auth/roles";
import { HttpError } from "@/lib/http";

/**
 * Tenant scoped authorisation (MSP technicians). `tenantScope` is "all" or the list of tenant ids a member may see.
 * Owners and admins always see everything; operators and viewers are limited by their scope.
 */
export interface Membership {
  role: OrgRole | string;
  tenantScope: "all" | string[];
}

export const ALL_TENANTS: Membership["tenantScope"] = "all";

export function inScope(m: Membership, tenantId: string): boolean {
  if (m.role === "owner" || m.role === "admin") return true;
  return m.tenantScope === "all" || m.tenantScope.includes(tenantId);
}

export function canAccess(m: Membership, resource: keyof typeof statements, action: string, tenantId?: string): boolean {
  if (!can(m.role, resource, action)) return false;
  return tenantId === undefined ? true : inScope(m, tenantId);
}

/** The single authorisation check used by routes and jobs. Throws 403 (never leaks whether the tenant exists). */
export function authorize(m: Membership, resource: keyof typeof statements, action: string, tenantId?: string): void {
  if (!canAccess(m, resource, action, tenantId)) throw new HttpError(403, "forbidden");
}

export function filterTenants<T extends { id: string }>(m: Membership, tenants: T[]): T[] {
  return tenants.filter((t) => inScope(m, t.id));
}
