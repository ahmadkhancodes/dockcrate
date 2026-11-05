import seed from "@/content/catalog-seed.json";
import type { Db } from "@/lib/db";
import { generateDetectionRules, type DetectionHint } from "./detection";
import { envManifestSigner, signVersion, type ManifestSigner } from "./manifest";
import { statusFromChecks } from "./verify";
import type { CatalogApp, CatalogVersion, Checks, QaEntry } from "./types";
import { requireVmVerification } from "@/lib/env";

export * from "./types";

interface SeedVersion {
  version: string; arch: CatalogVersion["arch"]; installerType: CatalogVersion["installerType"]; sha256: string;
  signer: { subject: string; thumbprint: string }; installCmd: string; uninstallCmd: string; setupFile: string;
  detectionHint: DetectionHint; minOs: string; testedAt: string; checks: Checks; previousSignerThumbprint?: string; heldReason?: string;
}
interface SeedApp { slug: string; name: string; publisher: string; wingetId: string; license: string; category?: string; version: SeedVersion }

const STEP_TEXT: Record<"hash" | "signer" | "scan" | "vm", Record<"pass" | "pending" | "fail", string>> = {
  hash: { pass: "Installer SHA-256 matches the manifest.", pending: "Hash not checked yet.", fail: "Hash mismatch." },
  signer: { pass: "Signer matches the previous version.", pending: "Signer not checked yet.", fail: "Signer changed from the previous version." },
  scan: { pass: "Scanned. No detections.", pending: "Scan not run yet.", fail: "Scan reported a detection." },
  vm: { pass: "Installed, detected and uninstalled in a clean Windows VM.", pending: "No Windows test lab is attached. The VM install and detection test has not run.", fail: "The VM test failed." },
};

/** Idempotent: loads the 6 sample apps from src/content/catalog-seed.json when the catalog collection is empty. */
export async function ensureCatalogSeeded(db: Db, signer: ManifestSigner = envManifestSigner(), now = new Date()): Promise<void> {
  const apps = db.collection<CatalogApp>("catalog");
  if ((await apps.find()).length > 0) return;
  const versions = db.collection<CatalogVersion>("catalog_versions");
  const at = now.toISOString();
  for (const a of (seed as { apps: SeedApp[] }).apps) {
    const s = a.version;
    const id = `${a.slug}@${s.version}`;
    const log: QaEntry[] = (["hash", "signer", "scan", "vm"] as const).map((step) => ({ at: `${s.testedAt}T00:00:00.000Z`, step, result: s.checks[step], message: STEP_TEXT[step][s.checks[step]] }));
    const v: CatalogVersion = {
      id, appSlug: a.slug, version: s.version, arch: s.arch, installerType: s.installerType, sha256: s.sha256, signer: s.signer,
      previousSignerThumbprint: s.previousSignerThumbprint ?? null, installCmd: s.installCmd, uninstallCmd: s.uninstallCmd, setupFile: s.setupFile,
      detection: generateDetectionRules(s.installerType, s.version, s.detectionHint), minOs: s.minOs,
      status: statusFromChecks(s.checks, requireVmVerification()), testedAt: s.testedAt,
      verification: { checks: s.checks, qaLog: log, heldReason: s.heldReason ?? null }, manifestSig: null, createdAt: at,
    };
    v.manifestSig = signVersion(signer, v);
    await versions.put(v);
    await apps.put({ id: a.slug, slug: a.slug, name: a.name, publisher: a.publisher, wingetId: a.wingetId, platform: "windows", license: a.license, category: a.category, currentVersionId: id, createdAt: at, updatedAt: at });
  }
}

export interface CatalogEntry { app: CatalogApp; version: CatalogVersion }

export async function listCatalog(db: Db): Promise<CatalogEntry[]> {
  await ensureCatalogSeeded(db);
  const [apps, versions] = await Promise.all([db.collection<CatalogApp>("catalog").find(), db.collection<CatalogVersion>("catalog_versions").find()]);
  const byId = new Map(versions.map((v) => [v.id, v]));
  return apps.flatMap((app) => { const version = byId.get(app.currentVersionId); return version ? [{ app, version }] : []; }).sort((a, b) => a.app.name.localeCompare(b.app.name));
}

export async function getCatalogEntry(db: Db, slug: string): Promise<CatalogEntry | null> {
  await ensureCatalogSeeded(db);
  const app = await db.collection<CatalogApp>("catalog").get(slug);
  const version = app ? await db.collection<CatalogVersion>("catalog_versions").get(app.currentVersionId) : null;
  return app && version ? { app, version } : null;
}

/** App slug of a version id (`slug@version`); falls back to the id prefix when the version is unknown. */
export async function appSlugOfVersion(db: Db, versionId: string): Promise<string> {
  const v = await db.collection<CatalogVersion>("catalog_versions").get(versionId);
  return v?.appSlug ?? versionId.split("@")[0]!;
}

/** Every known version of an app, newest first (by creation time, then tested date). */
export async function listVersions(db: Db, slug: string): Promise<CatalogVersion[]> {
  await ensureCatalogSeeded(db);
  return (await db.collection<CatalogVersion>("catalog_versions").find({ appSlug: slug })).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.testedAt.localeCompare(a.testedAt));
}
