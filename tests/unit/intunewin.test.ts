import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { unzipSync } from "fflate";
import { decryptAndVerify, packageIntunewin } from "@/lib/intunewin";

async function tmp() { return mkdtemp(join(tmpdir(), "iw-")); }

describe("intunewin payload", () => {
  it("round trips a multi chunk zip and reports correct sizes", async () => {
    const dir = await tmp();
    const big = randomBytes(5 * 1024 * 1024 + 17); // crosses several chunks
    const small = Buffer.from("msiexec /i app.msi /qn");
    const res = await packageIntunewin(
      [
        { name: "setup/app.msi", data: Readable.from([big.subarray(0, 2_000_000), big.subarray(2_000_000)]), store: true },
        { name: "install.cmd", data: small },
      ],
      join(dir, "IntunePackage.intunewin"),
    );
    expect((await stat(res.path)).size).toBe(res.sizeEncrypted);
    expect(res.sizeEncrypted).toBeGreaterThan(res.size); // MAC + IV + padding
    expect((res.sizeEncrypted - 48) % 16).toBe(0);
    const zip = await decryptAndVerify(res.path, res.fileEncryptionInfo);
    expect(zip.length).toBe(res.size);
    const files = unzipSync(new Uint8Array(zip));
    expect(Buffer.from(files["setup/app.msi"]!).equals(big)).toBe(true);
    expect(Buffer.from(files["install.cmd"]!).toString()).toBe(small.toString());
  });

  it("emits Graph shaped fileEncryptionInfo", async () => {
    const dir = await tmp();
    const { fileEncryptionInfo: i } = await packageIntunewin([{ name: "a.txt", data: Buffer.from("x") }], join(dir, "p"));
    expect(i.profileIdentifier).toBe("ProfileVersion1");
    expect(i.fileDigestAlgorithm).toBe("SHA256");
    expect(Buffer.from(i.encryptionKey, "base64")).toHaveLength(32);
    expect(Buffer.from(i.macKey, "base64")).toHaveLength(32);
    expect(Buffer.from(i.initializationVector, "base64")).toHaveLength(16);
    expect(Buffer.from(i.mac, "base64")).toHaveLength(32);
    expect(Buffer.from(i.fileDigest, "base64")).toHaveLength(32);
  });

  it("rejects a tampered payload (digest, then HMAC)", async () => {
    const dir = await tmp();
    const res = await packageIntunewin([{ name: "a.bin", data: randomBytes(100_000) }], join(dir, "p"));
    const orig = await readFile(res.path);
    const bad = Buffer.from(orig);
    bad[bad.length - 40] = (bad[bad.length - 40] ?? 0) ^ 0xff;
    await writeFile(res.path, bad);
    await expect(decryptAndVerify(res.path, res.fileEncryptionInfo)).rejects.toThrow(/Digest/i);
    // fix digest but leave ciphertext tampered: HMAC must catch it
    const { createHash } = await import("node:crypto");
    const info = { ...res.fileEncryptionInfo, fileDigest: createHash("sha256").update(bad).digest("base64") };
    await expect(decryptAndVerify(res.path, info)).rejects.toThrow(/HMAC/);
  });

  it("uses a fresh key and IV every run", async () => {
    const dir = await tmp();
    const a = await packageIntunewin([{ name: "a", data: Buffer.from("same") }], join(dir, "a"));
    const b = await packageIntunewin([{ name: "a", data: Buffer.from("same") }], join(dir, "b"));
    expect(a.fileEncryptionInfo.encryptionKey).not.toBe(b.fileEncryptionInfo.encryptionKey);
    expect(a.fileEncryptionInfo.initializationVector).not.toBe(b.fileEncryptionInfo.initializationVector);
  });
});
