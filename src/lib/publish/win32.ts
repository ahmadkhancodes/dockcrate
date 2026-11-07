import { createHash } from "node:crypto";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit } from "@/lib/audit";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { publishPlan } from "@/lib/catalog/verify";
import { verifyVersionManifest, type ManifestSigner } from "@/lib/catalog/manifest";
import type { CatalogApp, CatalogVersion } from "@/lib/catalog/types";
import type { Deps } from "@/lib/deps";
import type { GraphClient, Win32AppBody } from "@/lib/graph/types";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { packageIntunewin, type PackageResult, type ZipEntry } from "@/lib/intunewin";
import { getTenant, type Tenant } from "@/lib/tenants";
import type { Deployment, OrgSettings, RingConfig, TenantApp, Variant } from "@/lib/rings/types";
import type { InstallerSource } from "./installer";

export const APP_PREFIX = "DC |";
export type Packager = (entries: ZipEntry[], outPath: string) => Promise<PackageResult>;

export interface PublishCtx {
  installer: InstallerSource;
  signer: ManifestSigner;
  packager?: Packager;
  /** Poll attempts for Graph's async steps (SAS URI, commit). Tests use a small number. */
  maxPolls?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const intuneName = (app: Pick<CatalogApp, "name">, v: Pick<CatalogVersion, "version">) => `${APP_PREFIX} ${app.name} ${v.version}`;

export function win32Body(app: CatalogApp, v: CatalogVersion): Win32AppBody {
  return {
    displayName: intuneName(app, v), description: `${app.name} ${v.version} (${v.arch}), packaged and checked by DockCrate by BufferSol.`,
    publisher: app.publisher, displayVersion: v.version, installCommandLine: v.installCmd, uninstallCommandLine: v.uninstallCmd,
    setupFilePath: v.setupFile, fileName: `${v.setupFile}.intunewin`, minimumSupportedWindowsRelease: `Windows10_${v.minOs}`,
    detectionRules: v.detection, installExperience: { runAsAccount: "system", deviceRestartBehavior: "suppress" },
    returnCodes: [{ returnCode: 0, type: "success" }, { returnCode: 1707, type: "success" }, { returnCode: 3010, type: "softReboot" }, { returnCode: 1641, type: "hardReboot" }, { returnCode: 1618, type: "retry" }],
    notes: `Managed by DockCrate by BufferSol. Verification: ${v.verification.checks.hash}/${v.verification.checks.signer}/${v.verification.checks.scan}/${v.verification.checks.vm}.`,
  };
}

const exists = (p: string) => access(p).then(() => true, () => false);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function save(deps: Deps, d: Deployment, patch: Partial<Deployment>): Promise<Deployment> {
  const next = { ...d, ...patch, updatedAt: deps.now().toISOString() };
  await deps.db.collection<Deployment>("deployments").put(next);
  return next;
}

async function poll<T>(ctx: PublishCtx, fn: () => Promise<T>, done: (v: T) => boolean): Promise<T> {
  const max = ctx.maxPolls ?? 30;
  for (let i = 0; i < max; i++) {
    const v = await fn();
    if (done(v)) return v;
    await (ctx.sleep ?? wait)(2000);
  }
  throw new Error("poll_timeout");
}

/**
 * The upload state machine (ARCHITECTURE 3.4). Progress is persisted after every step, so a crash or timeout resumes
 * at the stored step and never creates a second Intune app (the app id is stored first).
 * create app -> content version -> content file -> wait for SAS -> upload blocks -> commit -> wait -> finalize -> assign Pilot.
 */
export async function advanceUpload(deps: Deps, ctx: PublishCtx, d: Deployment, app: CatalogApp, v: CatalogVersion, config: RingConfig, intent: RingConfig["intent"], graph: GraphClient): Promise<Deployment> {
  let cur = d;
  try {
    for (;;) {
      switch (cur.step) {
        case "create_app": {
          if (cur.createStartedAt) {
            // An earlier attempt may have created the app and crashed before saving its id: adopt it instead of creating a second one.
            const adopted = await findOrphan(deps, graph, cur, intuneName(app, v));
            if (adopted) {
              cur = await save(deps, cur, { intuneAppId: adopted.id, step: "content_version" });
              break;
            }
          }
          // The intent is stored first, so a crash between the Graph call and the next save leaves a trail the reconciler follows.
          cur = await save(deps, cur, { createStartedAt: deps.now().toISOString() });
          const r = await graph.createWin32App(win32Body(app, v));
          cur = await save(deps, cur, { intuneAppId: r.id, step: "content_version" });
          break;
        }
        case "content_version": {
          const r = await graph.createContentVersion(cur.intuneAppId!);
          const have = cur.pkg && (await exists(cur.pkg.path)) ? cur.pkg : null;
          let pkg = have;
          if (!pkg) {
            const src = await ctx.installer.open(v);
            const dir = await mkdtemp(join(tmpdir(), "dc-pkg-"));
            const out = await (ctx.packager ?? packageIntunewin)([{ name: src.name, data: src.data, store: true }], join(dir, `${v.id.replace(/[^\w.-]/g, "_")}.intunewin`));
            pkg = { path: out.path, size: out.size, sizeEncrypted: out.sizeEncrypted, info: out.fileEncryptionInfo };
          }
          cur = await save(deps, cur, { contentVersionId: r.id, pkg, fileId: null, sasUri: null, step: "content_file" });
          break;
        }
        case "content_file": {
          const r = await graph.createContentFile(cur.intuneAppId!, cur.contentVersionId!, { name: `${v.setupFile}.intunewin`, size: cur.pkg!.size, sizeEncrypted: cur.pkg!.sizeEncrypted });
          cur = await save(deps, cur, { fileId: r.id, step: "await_sas" });
          break;
        }
        case "await_sas": {
          const s = await poll(ctx, () => graph.getContentFile(cur.intuneAppId!, cur.contentVersionId!, cur.fileId!), (x) => x.uploadState === "azureStorageUriRequestSuccess");
          cur = await save(deps, cur, { sasUri: s.azureStorageUri ?? null, step: "upload" });
          break;
        }
        case "upload": {
          await graph.uploadToStorage(cur.sasUri!, cur.pkg!.path);
          cur = await save(deps, cur, { step: "commit" });
          break;
        }
        case "commit": {
          await graph.commitContentFile(cur.intuneAppId!, cur.contentVersionId!, cur.fileId!, cur.pkg!.info);
          cur = await save(deps, cur, { step: "await_commit" });
          break;
        }
        case "await_commit": {
          const s = await poll(ctx, () => graph.getContentFile(cur.intuneAppId!, cur.contentVersionId!, cur.fileId!), (x) => x.uploadState === "commitFileSuccess" || x.uploadState === "commitFileFailed");
          if (s.uploadState === "commitFileFailed") {
            // Expired or partial upload: take a fresh content version from the stored payload.
            cur = await save(deps, cur, { step: "content_version", error: "commit_failed_retrying" });
            break;
          }
          cur = await save(deps, cur, { step: "finalize" });
          break;
        }
        case "finalize": {
          await graph.setCommittedContentVersion(cur.intuneAppId!, cur.contentVersionId!);
          cur = await save(deps, cur, { step: "assign" });
          break;
        }
        case "assign": {
          const assignments = [{ groupId: config.pilot.groupId, intent }];
          await graph.assignApp(cur.intuneAppId!, assignments);
          // The previous version of the app leaves Pilot, so a group never has two versions Required at once.
          await retireOlder(deps, graph, cur, [config.pilot.groupId]);
          cur = await save(deps, cur, { assignments, state: "assigned", step: "done", pilotAssignedAt: deps.now().toISOString(), error: null, leaseUntil: null });
          await audit({ orgId: cur.orgId, actorId: null, action: "deployment.published", target: cur.id, meta: { tenantId: cur.tenantId, app: cur.appSlug, version: cur.version, ring: "pilot" } });
          return cur;
        }
        case "done":
          return cur;
      }
    }
  } catch (e) {
    // Progress is already stored; the next publish call or job tick resumes from `cur.step`.
    await save(deps, cur, { error: (e as Error).message.slice(0, 200), leaseUntil: null });
    throw e;
  }
}

/** An Intune app with this exact name that no deployment of the tenant has recorded (so it is ours from a crashed attempt). */
async function findOrphan(deps: Deps, graph: GraphClient, d: Deployment, name: string): Promise<{ id: string } | null> {
  const held = new Set((await deps.db.collection<Deployment>("deployments").find({ tenantId: d.tenantId })).filter((x) => x.id !== d.id).map((x) => x.intuneAppId));
  return (await graph.findAppsByName(name)).find((a) => !held.has(a.id)) ?? null;
}

const LIVE: Deployment["state"][] = ["assigned", "promoted", "paused"];

/**
 * Removes `groupIds` from the assignments of every earlier live deployment of the same app in the same tenant.
 * Without this, version N stays Required on a group next to N+1: an MSI detection rule (product code + exact version)
 * fails after the upgrade and Intune reinstalls or downgrades N, and an old Pilot deployment would still be promoted
 * to Broad by the ring tick. A deployment left with no assignment becomes `superseded` (still a rollback target).
 */
export async function retireOlder(deps: Deps, graph: GraphClient, cur: Deployment, groupIds: string[]): Promise<void> {
  const col = deps.db.collection<Deployment>("deployments");
  const older = (await col.find({ tenantId: cur.tenantId, appSlug: cur.appSlug })).filter((x) => x.id !== cur.id && LIVE.includes(x.state) && !!x.intuneAppId);
  for (const o of older) {
    const next = o.assignments.filter((a) => !groupIds.includes(a.groupId));
    if (next.length === o.assignments.length && next.length > 0) continue;
    await graph.assignApp(o.intuneAppId!, next);
    await col.put({ ...o, assignments: next, state: next.length === 0 ? "superseded" : o.state, updatedAt: deps.now().toISOString() });
    await audit({ orgId: o.orgId, actorId: null, action: "deployment.superseded", target: o.id, meta: { tenantId: o.tenantId, app: o.appSlug, version: o.version, by: cur.version, groups: groupIds.join(",") } });
  }
}

/** How long one publish call may hold a deployment before another call may resume it (longer than the 60 s function limit). */
export const PUBLISH_LEASE_MS = 5 * 60_000;

export interface PublishInput { orgId: string; tenantId: string; versionId: string; actorId: string | null; intent?: RingConfig["intent"]; variant?: Variant }

/** Publish one catalog version to one tenant (Pilot). Idempotent per tenant + version + variant; resumes an interrupted upload. */
export async function publishVersion(deps: Deps, ctx: PublishCtx, input: PublishInput): Promise<Deployment> {
  const tenant: Tenant = await getTenant(deps, input.orgId, input.tenantId);
  if (tenant.status !== "connected" || !tenant.entraTenantId) throw new HttpError(409, "tenant_not_connected");
  if (tenant.paused) throw new HttpError(409, "tenant_paused");
  if ((await deps.db.collection<OrgSettings>("org_settings").get(tenant.orgId))?.paused) throw new HttpError(409, "org_paused", "Publishing is paused for the whole organization.");
  const config = await deps.db.collection<RingConfig>("ring_configs").get(tenant.id);
  if (!config) throw new HttpError(409, "rings_not_configured", "Pick the Pilot and Broad groups first.");

  await ensureCatalogSeeded(deps.db, ctx.signer, deps.now());
  const v = await deps.db.collection<CatalogVersion>("catalog_versions").get(input.versionId);
  if (!v) throw new HttpError(404, "version_not_found");
  const app = await deps.db.collection<CatalogApp>("catalog").get(v.appSlug);
  if (!app) throw new HttpError(404, "app_not_found");
  // The signed manifest is checked again right before every upload (tamper test).
  if (!verifyVersionManifest(ctx.signer, v)) throw new HttpError(409, "manifest_invalid", "The manifest signature does not match this version.");
  const plan = publishPlan(v);
  if (!plan.allowed) throw new HttpError(409, "not_publishable", plan.reason);

  const variant = input.variant ?? "standard";
  const key = `${tenant.id}:${v.id}:${variant}`;
  const col = deps.db.collection<Deployment>("deployments");
  const now = deps.now().toISOString();
  const nowMs = deps.now().getTime();
  const lease = `${new Date(nowMs + PUBLISH_LEASE_MS).toISOString()}|${uuidv7()}`;
  const busy = () => new HttpError(409, "publish_in_progress", "This version is already being published to this tenant. Try again in a few minutes.");
  // The id is derived from the key, so the insert itself is the atomic one-publish-per-tenant-and-version guard
  // (Mongo: duplicate `_id`, plus the unique {tenantId, idempotencyKey} index; memory: check and write without an await).
  const id = `dep_${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
  const fresh: Deployment = {
    id, orgId: tenant.orgId, tenantId: tenant.id, appSlug: v.appSlug, versionId: v.id, version: v.version, variant, idempotencyKey: key,
    state: "uploading", step: "create_app", intuneAppId: null, contentVersionId: null, fileId: null, sasUri: null, pkg: null, assignments: [],
    pilotAssignedAt: null, broadAssignedAt: null, failurePct: null, pausedReason: null, error: null, leaseUntil: lease, createdAt: now, updatedAt: now,
  };
  let d: Deployment;
  if (await col.insertIfAbsent(fresh)) d = fresh;
  else {
    const existing = (await col.find({ tenantId: tenant.id, idempotencyKey: key }))[0];
    if (!existing) throw busy();
    if (existing.step === "done") return existing;
    const held = existing.leaseUntil ?? null;
    if (held && new Date(held.split("|")[0]!).getTime() > nowMs) throw busy();
    // Compare-and-set on the exact lease value we read: of several callers resuming together, exactly one wins.
    const won = await col.claim(existing.id, { leaseUntil: held }, { leaseUntil: lease });
    if (!won) throw busy();
    d = won;
  }

  const taId = `${tenant.id}:${v.appSlug}`;
  const tas = deps.db.collection<TenantApp>("tenant_apps");
  if (!(await tas.get(taId))) await tas.put({ id: taId, orgId: tenant.orgId, tenantId: tenant.id, appSlug: v.appSlug, autoUpdate: config.autoUpdateDefault ?? true, createdAt: now, updatedAt: now });

  d = await advanceUpload(deps, ctx, d, app, v, config, input.intent ?? config.intent, deps.graph.forTenant(tenant.entraTenantId));
  return d;
}
