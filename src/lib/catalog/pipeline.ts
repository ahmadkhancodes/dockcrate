import seed from "@/content/catalog-seed.json";
import type { CatalogVersion } from "./types";
import type { Evidence } from "./verify";

/** What a reviewed winget manifest says about the newest version of an app. */
export interface WingetManifest {
  wingetId: string;
  version: string;
  installerUrl: string;
  sha256: string;
  installerType: CatalogVersion["installerType"];
  arch: CatalogVersion["arch"];
}

/** Reads reviewed winget manifests (the top 200 list only, D-10). Real adapter: winget-pkgs over HTTPS from the egress allow list. */
export interface WingetSource {
  readonly name: string;
  latest(wingetId: string): Promise<WingetManifest | null>;
}

export interface DownloadedInstaller {
  /** SHA-256 of the bytes actually received, lowercase hex. */
  sha256: string;
  size: number;
  /** Where the Sandbox keeps the file for the scanner. Opaque to everything else. */
  ref: string;
}

/** Fetches an installer in the Sandbox. Real adapter: allow-listed hosts only, size cap, no redirects off the list. */
export interface InstallerDownloader {
  readonly name: string;
  download(url: string): Promise<DownloadedInstaller>;
}

export interface ScanReport {
  clean: boolean;
  /** Age of the scanner's signature database. Older than 24 h holds the version. */
  signatureAgeHours: number;
  detail?: string;
  /** Authenticode signer of the downloaded file, read in the same Sandbox. */
  signerThumbprint: string;
}

/** Malware scan and signer read of a downloaded installer. Real adapter: ClamAV plus signature inspection. */
export interface Scanner {
  readonly name: string;
  scan(file: DownloadedInstaller): Promise<ScanReport>;
}

export interface EvidenceSources { downloader: InstallerDownloader; scanner: Scanner }

export class NoInstallerUrlError extends Error {
  constructor(public versionId: string) {
    super(`no_installer_url:${versionId}`);
    this.name = "NoInstallerUrlError";
  }
}

/** Downloads and scans a version's installer, returning the evidence `verifyVersion` judges. `url` overrides the stored one. */
export async function collectEvidence(v: Pick<CatalogVersion, "id" | "installerUrl">, src: EvidenceSources, url?: string | null): Promise<Evidence> {
  const u = url ?? v.installerUrl;
  if (!u) throw new NoInstallerUrlError(v.id);
  const file = await src.downloader.download(u);
  const r = await src.scanner.scan(file);
  return { observedSha256: file.sha256, signerThumbprint: r.signerThumbprint, scan: { clean: r.clean, signatureAgeHours: r.signatureAgeHours, detail: r.detail } };
}

// ---- Fakes: deterministic, no network, no files ----

/** Serves the manifests of the sample seed list (src/content/catalog-seed.json) plus any added by tests. */
export class FakeWingetSource implements WingetSource {
  readonly name = "fake";
  readonly manifests = new Map<string, WingetManifest>();
  constructor(extra: WingetManifest[] = []) {
    for (const a of (seed as { apps: { wingetId: string; version: { version: string; sha256: string; installerType: CatalogVersion["installerType"]; arch: CatalogVersion["arch"] } }[] }).apps)
      this.manifests.set(a.wingetId, { wingetId: a.wingetId, version: a.version.version, sha256: a.version.sha256, installerType: a.version.installerType, arch: a.version.arch, installerUrl: `https://fake.invalid/${a.wingetId}/${a.version.version}` });
    for (const m of extra) this.manifests.set(m.wingetId, m);
  }
  async latest(wingetId: string) { return this.manifests.get(wingetId) ?? null; }
}

/** "Downloads" by answering with the hash declared for the URL; `hashes` overrides it per URL (tamper tests). */
export class FakeInstallerDownloader implements InstallerDownloader {
  readonly name = "fake";
  readonly calls: string[] = [];
  constructor(private defaultHash: (url: string) => string, readonly hashes: Record<string, string> = {}) {}
  async download(url: string): Promise<DownloadedInstaller> {
    this.calls.push(url);
    return { sha256: this.hashes[url] ?? this.defaultHash(url), size: 1024, ref: `fake:${url}` };
  }
}

/** Reports clean with a fresh database unless told otherwise. `signers` maps a file ref to its thumbprint. */
export class FakeScanner implements Scanner {
  readonly name = "fake";
  readonly calls: string[] = [];
  constructor(private signerFor: (ref: string) => string, public opts: { infected?: Set<string>; signatureAgeHours?: number } = {}) {}
  async scan(file: DownloadedInstaller): Promise<ScanReport> {
    this.calls.push(file.ref);
    const infected = this.opts.infected?.has(file.ref) ?? false;
    return { clean: !infected, signatureAgeHours: this.opts.signatureAgeHours ?? 1, detail: infected ? "Eicar-Test-Signature" : undefined, signerThumbprint: this.signerFor(file.ref) };
  }
}
