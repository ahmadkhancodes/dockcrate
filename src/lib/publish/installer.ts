import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HttpError } from "@/lib/http";
import type { CatalogVersion } from "@/lib/catalog/types";

/** Where the installer bytes come from. Tests pass a buffer; production downloads from the reviewed vendor URL. */
export interface InstallerSource {
  open(v: CatalogVersion): Promise<{ name: string; data: Buffer | Readable }>;
}

export class BufferInstallerSource implements InstallerSource {
  constructor(private readonly bytes: Buffer = Buffer.from("installer-bytes")) {}
  async open(v: CatalogVersion) {
    return { name: v.setupFile, data: this.bytes };
  }
}

export interface DownloadLimits {
  /** Hard cap on the installer size in bytes (the function's /tmp is small). */
  maxBytes: number;
  /** Covers the headers and the whole body. */
  timeoutMs: number;
  maxRedirects: number;
}

export const DEFAULT_DOWNLOAD_LIMITS: DownloadLimits = { maxBytes: 400 * 1024 * 1024, timeoutMs: 45_000, maxRedirects: 3 };

/** Follows redirects by hand: HTTPS only, same host as the reviewed URL, never to another host. */
async function fetchSameHost(fetchImpl: typeof fetch, url: string, signal: AbortSignal, maxRedirects: number): Promise<Response> {
  const origin = new URL(url);
  let cur = origin;
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(cur.toString(), { redirect: "manual", signal });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    await res.body?.cancel().catch(() => {});
    if (!loc || hop >= maxRedirects) throw new HttpError(502, "installer_redirect_refused", "Too many redirects.");
    let next: URL;
    try { next = new URL(loc, cur); } catch { throw new HttpError(502, "installer_redirect_refused"); }
    if (next.protocol !== "https:" || next.host !== origin.host) throw new HttpError(502, "installer_redirect_refused", "The installer URL redirected to another host.");
    cur = next;
  }
}

/** Streams the vendor installer to a temp file with a size cap and a timeout, and refuses it when the SHA-256 differs from the signed manifest. */
export class UrlInstallerSource implements InstallerSource {
  private readonly limits: DownloadLimits;
  constructor(private readonly fetchImpl: typeof fetch = fetch, limits: Partial<DownloadLimits> = {}) {
    this.limits = { ...DEFAULT_DOWNLOAD_LIMITS, ...limits };
  }
  async open(v: CatalogVersion) {
    if (!v.installerUrl || !v.installerUrl.startsWith("https://")) throw new HttpError(501, "installer_download_not_available", "This version has no reviewed installer URL yet.");
    const { maxBytes, timeoutMs, maxRedirects } = this.limits;
    const signal = AbortSignal.timeout(timeoutMs);
    const dir = await mkdtemp(join(tmpdir(), "dc-installer-"));
    const path = join(dir, v.setupFile.replace(/[^\w.-]/g, "_"));
    try {
      const res = await fetchSameHost(this.fetchImpl, v.installerUrl, signal, maxRedirects);
      if (!res.ok || !res.body) throw new HttpError(502, "installer_download_failed");
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "installer_too_large");
      const hash = createHash("sha256");
      let seen = 0;
      const src = Readable.fromWeb(res.body as never);
      src.on("data", (c: Buffer) => {
        seen += c.length;
        hash.update(c);
        if (seen > maxBytes) src.destroy(new HttpError(413, "installer_too_large"));
      });
      await pipeline(src, createWriteStream(path), { signal });
      if (hash.digest("hex") !== v.sha256.toLowerCase()) throw new HttpError(409, "installer_hash_mismatch");
    } catch (e) {
      await rm(dir, { recursive: true, force: true });
      if (e instanceof HttpError) throw e;
      if (signal.aborted) throw new HttpError(504, "installer_download_timeout");
      throw new HttpError(502, "installer_download_failed");
    }
    return { name: v.setupFile, data: createReadStream(path) };
  }
}
