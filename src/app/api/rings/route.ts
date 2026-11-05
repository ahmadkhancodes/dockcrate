import { z } from "zod";
import { apiCtx } from "@/lib/api/ctx";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authz";
import { json, readJson, withApi } from "@/lib/http";
import { defaultRingConfig } from "@/lib/rings/engine";
import type { RingConfig } from "@/lib/rings/types";
import { getTenant } from "@/lib/tenants";

export const runtime = "nodejs";

const group = z.object({ id: z.string().min(1), name: z.string().min(1).max(200) });
const body = z.object({
  tenantId: z.string().min(1), pilot: group, broad: group,
  broadDelayHours: z.number().int().min(0).max(24 * 30).optional(), failThresholdPct: z.number().min(1).max(100).optional(),
  intent: z.enum(["required", "available"]).optional(), alertEmail: z.string().email().nullable().optional(),
});

/** Ring setup for a tenant: Pilot and Broad groups, delay, failure threshold. */
export const POST = withApi(async (req) => {
  const { org, membership, deps } = await apiCtx();
  const b = await readJson(req, body);
  authorize(membership, "ring", "configure", b.tenantId);
  const t = await getTenant(deps, org.org.id, b.tenantId);
  const base = defaultRingConfig(t, b.pilot, b.broad);
  const cfg: RingConfig = { ...base, broad: { ...base.broad, delayHours: b.broadDelayHours ?? base.broad.delayHours }, failThresholdPct: b.failThresholdPct ?? base.failThresholdPct, intent: b.intent ?? "required", alertEmail: b.alertEmail ?? null };
  await deps.db.collection<RingConfig>("ring_configs").put(cfg);
  await audit({ orgId: t.orgId, actorId: org.user.id, action: "rings.configured", target: t.id, meta: { tenantId: t.id } });
  return json({ rings: cfg });
});
