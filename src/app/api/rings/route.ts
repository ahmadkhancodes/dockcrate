import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authz";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { validateRingConfig } from "@/lib/rings/config";
import type { RingConfig } from "@/lib/rings/types";
import { getTenant } from "@/lib/tenants";

export const runtime = "nodejs";

const group = z.object({ id: z.string().min(1), name: z.string().max(200).optional() });
const body = z.object({
  tenantId: z.string().min(1), pilot: group, broad: group,
  pilotDelayHours: z.number().optional(), broadDelayHours: z.number().optional(), failThresholdPct: z.number().optional(),
  intent: z.enum(["required", "available"]).optional(), autoUpdateDefault: z.boolean().optional(), alertEmail: z.string().nullable().optional(),
});

/** Ring setup for a tenant: Pilot and Broad groups, delays, failure threshold, auto update default. */
export const POST = withApi(async (req) => {
  const { org, membership, deps } = await apiCtx();
  const b = await readJson(req, body);
  authorize(membership, "ring", "configure", b.tenantId);
  const t = await getTenant(deps, org.org.id, b.tenantId);
  if (t.status !== "connected" || !t.entraTenantId) throw new HttpError(409, "tenant_not_connected");
  const groups = await deps.graph.forTenant(t.entraTenantId).listGroups();
  const cfg: RingConfig = validateRingConfig(t, b, groups);
  await deps.db.collection<RingConfig>("ring_configs").put(cfg);
  await audit({ orgId: t.orgId, actorId: org.user.id, action: "rings.configured", target: t.id, meta: { tenantId: t.id, broadDelayHours: cfg.broad.delayHours, failThresholdPct: cfg.failThresholdPct } });
  return json({ rings: cfg });
});
