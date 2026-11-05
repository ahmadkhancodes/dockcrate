/**
 * Clean-room implementation of the Intune Win32 app content format, written from the public
 * Microsoft Graph documentation for win32LobApp content upload (fileEncryptionInfo). No code is
 * copied from Microsoft's Win32 Content Prep Tool or from SvRooij.ContentPrep (GPL).
 *
 * Payload layout (the file uploaded to the Azure SAS URI):
 *   HMAC-SHA256(32 bytes) || IV (16 bytes) || AES-256-CBC(zip of the source folder)
 * where the HMAC (key = macKey) is computed over IV || ciphertext.
 * fileEncryptionInfo.fileDigest is the SHA-256 of the whole payload file (including the HMAC).
 *
 * Graph only needs this inner payload plus fileEncryptionInfo, size (unencrypted zip) and
 * sizeEncrypted. The outer Metadata/Detection.xml wrapper Microsoft's tool adds is not produced.
 * Streaming: memory stays bounded for large installers; the MAC is written at offset 0 at the end.
 */
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { PassThrough, Readable } from "node:stream";

export interface ZipEntry {
  /** Path inside the zip, forward slashes. */
  name: string;
  data: Buffer | Uint8Array | Readable;
  /** Store without compression (installers are usually already compressed). Default false. */
  store?: boolean;
}

export interface FileEncryptionInfo {
  encryptionKey: string;
  macKey: string;
  initializationVector: string;
  mac: string;
  profileIdentifier: "ProfileVersion1";
  fileDigest: string;
  fileDigestAlgorithm: "SHA256";
}

export interface PackageResult {
  /** Path of the encrypted payload file. */
  path: string;
  /** Size of the unencrypted zip in bytes (Graph `size`). */
  size: number;
  /** Size of the payload file in bytes (Graph `sizeEncrypted`). */
  sizeEncrypted: number;
  fileEncryptionInfo: FileEncryptionInfo;
}

const MAC_LEN = 32;
const IV_LEN = 16;

async function* chunksOf(data: ZipEntry["data"]): AsyncGenerator<Uint8Array> {
  if (data instanceof Uint8Array) {
    const CH = 1 << 20;
    for (let i = 0; i < data.length; i += CH) yield data.subarray(i, i + CH);
    return;
  }
  for await (const c of data) yield typeof c === "string" ? Buffer.from(c) : (c as Uint8Array);
}

/** Zip the entries as a stream, with back pressure. */
export function zipStream(entries: ZipEntry[]): Readable {
  const out = new PassThrough({ highWaterMark: 1 << 20 });
  const zip = new Zip((err, chunk, final) => {
    if (err) return void out.destroy(err);
    out.write(chunk);
    if (final) out.end();
  });
  (async () => {
    for (const e of entries) {
      const file = e.store ? new ZipPassThrough(e.name) : new ZipDeflate(e.name, { level: 6 });
      zip.add(file);
      let wrote = false;
      for await (const chunk of chunksOf(e.data)) {
        file.push(chunk, false);
        wrote = true;
        if (out.writableNeedDrain) await new Promise<void>((r) => out.once("drain", () => r()));
      }
      file.push(new Uint8Array(0), true);
      void wrote;
    }
    zip.end();
  })().catch((e) => out.destroy(e));
  return out;
}

/** Encrypt a zip stream into the Intune payload file at `outPath`. */
export async function encryptZipToFile(zip: Readable, outPath: string): Promise<PackageResult> {
  const key = randomBytes(32);
  const macKey = randomBytes(32);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const hmac = createHmac("sha256", macKey);
  hmac.update(iv);

  const fh = await open(outPath, "w+");
  let size = 0;
  let pos = MAC_LEN + IV_LEN;
  try {
    await fh.write(Buffer.alloc(MAC_LEN), 0, MAC_LEN, 0); // placeholder for the MAC
    await fh.write(iv, 0, IV_LEN, MAC_LEN);
    for await (const chunk of zip) {
      const buf = chunk as Buffer;
      size += buf.length;
      const enc = cipher.update(buf);
      if (enc.length) {
        hmac.update(enc);
        await fh.write(enc, 0, enc.length, pos);
        pos += enc.length;
      }
    }
    const last = cipher.final();
    if (last.length) {
      hmac.update(last);
      await fh.write(last, 0, last.length, pos);
      pos += last.length;
    }
    const mac = hmac.digest();
    await fh.write(mac, 0, MAC_LEN, 0);

    const digest = createHash("sha256");
    for await (const c of createReadStream(outPath)) digest.update(c as Buffer);

    return {
      path: outPath,
      size,
      sizeEncrypted: pos,
      fileEncryptionInfo: {
        encryptionKey: key.toString("base64"),
        macKey: macKey.toString("base64"),
        initializationVector: iv.toString("base64"),
        mac: mac.toString("base64"),
        profileIdentifier: "ProfileVersion1",
        fileDigest: digest.digest("base64"),
        fileDigestAlgorithm: "SHA256",
      },
    };
  } finally {
    await fh.close();
  }
}

/** Convenience: zip + encrypt. */
export function packageIntunewin(entries: ZipEntry[], outPath: string): Promise<PackageResult> {
  return encryptZipToFile(zipStream(entries), outPath);
}

/** Verify MAC and digest, then decrypt back to the zip. Throws on any mismatch. Used by tests and lab checks. */
export async function decryptAndVerify(path: string, info: FileEncryptionInfo): Promise<Buffer> {
  const file = await readFile(path);
  if (file.length < MAC_LEN + IV_LEN + 16) throw new Error("payload too short");
  const digest = createHash("sha256").update(file).digest("base64");
  if (digest !== info.fileDigest) throw new Error("fileDigest mismatch");
  const mac = file.subarray(0, MAC_LEN);
  const iv = file.subarray(MAC_LEN, MAC_LEN + IV_LEN);
  const body = file.subarray(MAC_LEN + IV_LEN);
  if (!iv.equals(Buffer.from(info.initializationVector, "base64"))) throw new Error("IV mismatch");
  const expected = createHmac("sha256", Buffer.from(info.macKey, "base64")).update(file.subarray(MAC_LEN)).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) throw new Error("HMAC mismatch");
  if (!mac.equals(Buffer.from(info.mac, "base64"))) throw new Error("mac field mismatch");
  const decipher = createDecipheriv("aes-256-cbc", Buffer.from(info.encryptionKey, "base64"), iv);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
