import type { Db } from "@/lib/db";
import { requireVmVerification } from "@/lib/env";
import { ensureCatalogSeeded } from "./index";
import { signVersion, type ManifestSigner } from "./manifest";
import { collectEvidence, FakeInstallerDownloader, FakeScanner, FakeWingetSource, type EvidenceSources, type WingetSource } from "./pipeline";
import type { CatalogApp, CatalogVersion, Checks, VersionStatus } from "./types";
import { verifyVersion } from "./verify";
import type { VmLab } from "./vmlab";

export interface SyncItem { slug: string; version: string; status: VersionStatus | "skipped"; checks: Checks | null; newVersion: boolean; persisted: boolean; detail?: string }
export interface SyncResult { source: string; persisted: boolean; items: SyncItem[]; counts: Record<string, number> }

export interface SyncOptions {
  winget: WingetSource;
  sources: EvidenceSources;
  lab: VmLab;
  signer: ManifestSigner;
  /** Write results back to the catalog. Off while only fakes feed the pipeline: a fake run must never mark a version verified. */
  persist: boolean;
  now?: Date;
  requireVm?: boolean;
}

/**
 * Runs every catalog app through the pipeline: winget manifest, download, scan, then `verifyVersion`.
 * A newer manifest version becomes a candidate with no detection rule (publishable only after review, D-10).
 */
export async function catalogSync(db: Db, o: SyncOptions): Promise<SyncResult> {
  const now = o.now ?? new Date();
  const apps = db.collection<CatalogApp>("catalog");
  const versions = db.collection<CatalogVersion>("catalog_versions");
  const items: SyncItem[] = [];
  for (const app of (await apps.find()).sort((a, b) => a.slug.localeCompare(b.slug))) {
    const cur = await versions.get(app.currentVersionId);
    if (!cur) continue;
    try {
      const m = await o.winget.latest(app.wingetId);
      if (!m) { items.push({ slug: app.slug, version: cur.version, status: "skipped", checks: null, newVersion: false, persisted: false, detail: "Not in the reviewed winget list." }); continue; }
      const newVersion = m.version !== cur.version;
      const base: CatalogVersion = newVersion
        ? { ...cur, id: `${app.slug}@${m.version}`, version: m.version, sha256: m.sha256, installerUrl: m.installerUrl, installerType: m.installerType, arch: m.arch, previousSignerThumbprint: cur.signer.thumbprint, detection: [], status: "candidate", manifestSig: null, createdAt: now.toISOString(), verification: { checks: { hash: "pending", signer: "pending", scan: "pending", vm: "pending" }, qaLog: [], heldReason: null } }
        : cur;
      const evidence = await collectEvidence(base, o.sources, m.installerUrl);
      const done = await verifyVersion(base, evidence, o.lab, now, o.requireVm ?? requireVmVerification());
      if (o.persist) {
        const signed = { ...done, manifestSig: signVersion(o.signer, done) };
        await versions.put(signed);
        if (newVersion && (done.status === "verified" || done.status === "verified_static")) await apps.put({ ...app, currentVersionId: signed.id, updatedAt: now.toISOString() });
      }
      items.push({ slug: app.slug, version: done.version, status: done.status, checks: done.verification.checks, newVersion, persisted: o.persist, detail: done.verification.heldReason ?? (newVersion ? "New version: needs a reviewed detection rule before it can publish." : undefined) });
    } catch (e) {
      items.push({ slug: app.slug, version: cur.version, status: "skipped", checks: null, newVersion: false, persisted: false, detail: (e as Error).message });
    }
  }
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.status] = (counts[i.status] ?? 0) + 1;
  return { source: o.winget.name, persisted: o.persist, items, counts };
}

/** Fakes wired to the current catalog: hashes and signers match what the catalog holds, so only real mismatches hold. */
export async function fakePipeline(db: Db, signer: ManifestSigner, lab: VmLab, now = new Date()): Promise<SyncOptions> {
  await ensureCatalogSeeded(db, signer, now);
  const winget = new FakeWingetSource();
  const byUrl = new Map<string, CatalogVersion>();
  const versions = await db.collection<CatalogVersion>("catalog_versions").find();
  for (const a of await db.collection<CatalogApp>("catalog").find()) {
    const m = await winget.latest(a.wingetId);
    const v = versions.find((x) => x.id === a.currentVersionId);
    if (m && v) byUrl.set(m.installerUrl, v);
  }
  const downloader = new FakeInstallerDownloader((u) => byUrl.get(u)?.sha256 ?? "0".repeat(64));
  const scanner = new FakeScanner((ref) => byUrl.get(ref.replace(/^fake:/, ""))?.signer.thumbprint ?? "unknown");
  return { winget, sources: { downloader, scanner }, lab, signer, persist: false, now };
}
