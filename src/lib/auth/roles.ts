import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, ownerAc } from "better-auth/plugins/organization/access";

// Org roles: owner / admin / operator / viewer. App statements extend Better Auth's defaults.
export const statements = {
  ...defaultStatements,
  billing: ["read", "manage"],
  // "create", "update" and "delete" are the actions the Better Auth API key plugin checks for organisation keys;
  // "manage" is what our own UI checks. Owners and admins hold all of them (SECURITY-REVIEW S-5).
  apiKey: ["read", "manage", "create", "update", "delete"],
  webhook: ["read", "manage"],
  audit: ["read"],
  data: ["read", "write"],
  tenant: ["read", "connect"],
  deployment: ["read", "publish", "rollback"],
  ring: ["read", "configure"],
} as const;

export const ac = createAccessControl(statements);

export const owner = ac.newRole({
  ...ownerAc.statements,
  billing: ["read", "manage"],
  apiKey: ["read", "manage", "create", "update", "delete"],
  webhook: ["read", "manage"],
  audit: ["read"],
  data: ["read", "write"],
  tenant: ["read", "connect"],
  deployment: ["read", "publish", "rollback"],
  ring: ["read", "configure"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  billing: ["read"],
  apiKey: ["read", "manage", "create", "update", "delete"],
  webhook: ["read", "manage"],
  audit: ["read"],
  data: ["read", "write"],
  tenant: ["read", "connect"],
  deployment: ["read", "publish", "rollback"],
  ring: ["read", "configure"],
});

/** Operator (technician): publishes and rolls back, cannot connect tenants, change rings or see billing details. */
export const operator = ac.newRole({
  billing: ["read"],
  apiKey: ["read"],
  webhook: ["read"],
  audit: ["read"],
  data: ["read", "write"],
  tenant: ["read"],
  deployment: ["read", "publish", "rollback"],
  ring: ["read"],
});

export const viewer = ac.newRole({
  data: ["read"],
  tenant: ["read"],
  deployment: ["read"],
  ring: ["read"],
});

export const roles = { owner, admin, operator, viewer };
export type OrgRole = keyof typeof roles;
export const ROLE_ORDER: OrgRole[] = ["viewer", "operator", "admin", "owner"];

/** Pure permission table used by server guards and UI (mirrors the roles above). */
export function can(role: string | null | undefined, resource: keyof typeof statements, action: string): boolean {
  const r = roles[(role ?? "") as OrgRole];
  if (!r) return false;
  const allowed = (r.statements as Record<string, readonly string[] | undefined>)[resource];
  return !!allowed?.includes(action);
}
