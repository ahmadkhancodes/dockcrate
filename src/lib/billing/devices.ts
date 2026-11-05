import type { Deps } from "@/lib/deps";
import type { Deployment } from "@/lib/rings/types";
import type { Tenant } from "@/lib/tenants";

/** Counts the Windows devices DockCrate manages in one tenant. Nightly job input; a real Graph reader plugs in here later. */
export interface DeviceCounter {
  readonly name: string;
  count(tenant: Tenant): Promise<number>;
}

/** Test and stub counter with fixed numbers per tenant id. */
export class FakeDeviceCounter implements DeviceCounter {
  readonly name = "fake";
  constructor(public counts: Record<string, number> = {}, public fail = new Set<string>()) {}
  async count(t: Tenant) {
    if (this.fail.has(t.id)) throw new Error("injected_failure");
    return this.counts[t.id] ?? 0;
  }
}

/**
 * Counts from the Graph device install data we already read for rings: for each published app the devices with a
 * result (installed + failed + pending); the tenant's count is the largest of those. A lower bound of the managed
 * devices that received DockCrate apps, which is what is billed.
 */
export class InstallDataDeviceCounter implements DeviceCounter {
  readonly name = "install-data";
  constructor(private deps: Pick<Deps, "db" | "graph">) {}
  async count(t: Tenant) {
    if (!t.entraTenantId) return 0;
    const graph = this.deps.graph.forTenant(t.entraTenantId);
    const ds = (await this.deps.db.collection<Deployment>("deployments").find({ tenantId: t.id })).filter((d) => d.step === "done" && d.intuneAppId && d.state !== "rolled_back");
    let max = 0;
    for (const d of ds) {
      const s = await graph.getInstallSummary(d.intuneAppId!);
      max = Math.max(max, s.installed + s.failed + s.pending);
    }
    return max;
  }
}

export interface DeviceCount { id: string; orgId: string; count: number; countedAt: string }
export interface OrgBilling { id: string; overSince: string | null }
