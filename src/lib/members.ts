import { audit } from "@/lib/audit";
import { setTenantScope } from "@/lib/auth/scope";
import { ROLE_ORDER } from "@/lib/auth/roles";
import { authorize, type Membership } from "@/lib/authz";
import type { Deps } from "@/lib/deps";
import { HttpError } from "@/lib/http";
import type { Tenant } from "@/lib/tenants";

/** Roles whose reach is limited by a tenant scope. Owners and admins always see every tenant. */
export const SCOPED_ROLES = ["operator", "viewer"];

/**
 * Edits a member's tenant scope (the M3 gap). Only owners and admins (`member:update`), the target must be a scoped role,
 * every tenant id must belong to this org, and an empty list is refused (use "all" or pick at least one tenant).
 */
export async function updateMemberScope(deps: Deps, input: { actor: Membership; actorId: string; orgId: string; userId: string; targetRole: string; scope: "all" | string[] }) {
  authorize(input.actor, "member", "update");
  if (!ROLE_ORDER.includes(input.targetRole as never)) throw new HttpError(400, "invalid_role");
  if (!SCOPED_ROLES.includes(input.targetRole)) throw new HttpError(400, "scope_not_applicable", "Owners and admins always see every tenant.");
  let scope: "all" | string[] = input.scope;
  if (scope !== "all") {
    scope = [...new Set(scope)];
    if (scope.length === 0) throw new HttpError(400, "scope_empty", "Pick at least one tenant, or choose all tenants.");
    const own = new Set((await deps.db.collection<Tenant>("tenants").find({ orgId: input.orgId })).map((t) => t.id));
    if (scope.some((id) => !own.has(id))) throw new HttpError(400, "unknown_tenant");
  }
  await setTenantScope(deps.db, input.orgId, input.userId, scope);
  await audit({ orgId: input.orgId, actorId: input.actorId, action: "member.scope_changed", target: input.userId, meta: { scope: scope === "all" ? "all" : scope.join(","), count: scope === "all" ? -1 : scope.length } });
  return scope;
}
