import { z } from "zod";
import { ensurePrefs, savePrefs } from "@/lib/alerts";
import { apiCtx } from "@/lib/api/ctx";
import { filterTenants } from "@/lib/authz";
import { json, readJson, withApi } from "@/lib/http";
import type { Tenant } from "@/lib/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const who = (c: Awaited<ReturnType<typeof apiCtx>>) => ({ orgId: c.org.org.id, userId: c.org.user.id, email: c.org.user.email, role: c.org.role });

/** Preferences are per user and per organization; muted tenants are limited to the tenants this user can see. */
export const GET = withApi(async () => {
  const c = await apiCtx();
  const prefs = await ensurePrefs(c.deps, who(c));
  const tenants = filterTenants(c.membership, await c.deps.db.collection<Tenant>("tenants").find({ orgId: c.org.org.id }));
  return json({ prefs, tenants: tenants.map((t) => ({ id: t.id, name: t.name })) });
});

export const PUT = withApi(async (req) => {
  const c = await apiCtx();
  const body = await readJson(req, z.object({ inApp: z.boolean().optional(), emailOn: z.boolean().optional(), digest: z.enum(["instant", "daily"]).optional(), mutedTenants: z.array(z.string().max(80)).max(500).optional() }));
  if (body.mutedTenants) {
    const visible = new Set(filterTenants(c.membership, await c.deps.db.collection<Tenant>("tenants").find({ orgId: c.org.org.id })).map((t) => t.id));
    body.mutedTenants = body.mutedTenants.filter((id) => visible.has(id));
  }
  return json({ prefs: await savePrefs(c.deps, who(c), body) });
});
