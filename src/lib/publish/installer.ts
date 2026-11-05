import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
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

/** Streams the vendor installer to a temp file and refuses it when the SHA-256 differs from the signed manifest. */
export class UrlInstallerSource implements InstallerSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  async open(v: CatalogVersion) {
    if (!v.installerUrl || !v.installerUrl.startsWith("https://")) throw new HttpError(501, "installer_download_not_available", "This version has no reviewed installer URL yet.");
    const res = await this.fetchImpl(v.installerUrl);
    if (!res.ok || !res.body) throw new HttpError(502, "installer_download_failed");
    const dir = await mkdtemp(join(tmpdir(), "dc-installer-"));
    const path = join(dir, v.setupFile.replace(/[^\w.-]/g, "_"));
    const hash = createHash("sha256");
    const src = Readable.fromWeb(res.body as never);
    src.on("data", (c) => hash.update(c));
    await pipeline(src, createWriteStream(path));
    if (hash.digest("hex") !== v.sha256.toLowerCase()) throw new HttpError(409, "installer_hash_mismatch");
    const { createReadStream } = await import("node:fs");
    return { name: v.setupFile, data: createReadStream(path) };
  }
}
