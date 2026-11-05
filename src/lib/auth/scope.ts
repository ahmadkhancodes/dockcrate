import type { Db } from "@/lib/db";
import type { Membership } from "@/lib/authz";

/** `memberships_ext`: tenant scope per member (MSP technicians see only their tenants). No row = all tenants. */
export interface MembershipExt { id: string; orgId: string; userId: string; tenantScope: "all" | string[] }

export const membershipId = (orgId: string, userId: string) => `${orgId}:${userId}`;

export async function getMembership(db: Db, orgId: string, userId: string, role: string): Promise<Membership> {
  const ext = await db.collection<MembershipExt>("memberships_ext").get(membershipId(orgId, userId));
  return { role, tenantScope: ext?.orgId === orgId ? ext.tenantScope : "all" };
}

export async function setTenantScope(db: Db, orgId: string, userId: string, tenantScope: "all" | string[]) {
  await db.collection<MembershipExt>("memberships_ext").put({ id: membershipId(orgId, userId), orgId, userId, tenantScope });
}
