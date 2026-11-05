import { HttpError } from "@/lib/http";
import { defaultRingConfig } from "./engine";
import type { RingConfig } from "./types";

export interface RingConfigInput {
  tenantId: string;
  pilot: { id: string; name?: string };
  broad: { id: string; name?: string };
  pilotDelayHours?: number;
  broadDelayHours?: number;
  failThresholdPct?: number;
  intent?: RingConfig["intent"];
  autoUpdateDefault?: boolean;
  alertEmail?: string | null;
}

export const MAX_DELAY_HOURS = 24 * 30;

/**
 * Validates a ring setup and builds the stored config. `groups` are the tenant's Entra groups (GET /groups); names are
 * taken from there, never from the client. Throws 400 `invalid_rings` with a plain sentence.
 */
export function validateRingConfig(tenant: { id: string; orgId: string }, input: RingConfigInput, groups: { id: string; displayName: string }[]): RingConfig {
  const bad = (m: string) => new HttpError(400, "invalid_rings", m);
  const byId = new Map(groups.map((g) => [g.id, g.displayName]));
  if (!byId.has(input.pilot.id)) throw bad("The Pilot group was not found in this tenant.");
  if (!byId.has(input.broad.id)) throw bad("The Broad group was not found in this tenant.");
  if (input.pilot.id === input.broad.id) throw bad("Pilot and Broad must be different groups.");
  const base = defaultRingConfig(tenant, { id: input.pilot.id, name: byId.get(input.pilot.id)! }, { id: input.broad.id, name: byId.get(input.broad.id)! });
  const pilotDelay = input.pilotDelayHours ?? base.pilot.delayHours;
  const broadDelay = input.broadDelayHours ?? base.broad.delayHours;
  for (const [n, v] of [["Pilot delay", pilotDelay], ["Broad delay", broadDelay]] as const)
    if (!Number.isInteger(v) || v < 0 || v > MAX_DELAY_HOURS) throw bad(`${n} must be a whole number of hours from 0 to ${MAX_DELAY_HOURS}.`);
  if (broadDelay < pilotDelay) throw bad("The Broad delay cannot be shorter than the Pilot delay.");
  const threshold = input.failThresholdPct ?? base.failThresholdPct;
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) throw bad("The failure threshold must be between 1 and 100 percent.");
  if (input.alertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.alertEmail)) throw bad("The alert email address is not valid.");
  return {
    ...base,
    pilot: { ...base.pilot, delayHours: pilotDelay },
    broad: { ...base.broad, delayHours: broadDelay },
    failThresholdPct: threshold,
    intent: input.intent ?? base.intent,
    autoUpdateDefault: input.autoUpdateDefault ?? true,
    alertEmail: input.alertEmail ?? null,
  };
}
