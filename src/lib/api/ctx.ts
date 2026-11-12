import { getMembership } from "@/lib/auth/scope";
import { requireOrg, type OrgContext } from "@/lib/auth/session";
import type { Membership } from "@/lib/authz";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";
import { defaultDeps, type Deps } from "@/lib/deps";

export interface ApiCtx { org: OrgContext; membership: Membership; deps: Deps }

/** Session, org, role with tenant scope and the real dependencies, for route handlers and server pages. */
export async function apiCtx(opts: { page?: boolean } = {}): Promise<ApiCtx> {
  const org = await requireOrg(opts);
  const deps = await defaultDeps();
  // Abuse brake for every signed-in API and page load: per user, generous for humans, tight for loops.
  await enforceRateLimit(`api:user:${org.user.id}`, RULES.api, deps.db);
  return { org, membership: await getMembership(deps.db, org.org.id, org.user.id, org.role), deps };
}
