import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { dbDriver, env, isProd } from "@/lib/env";
import { HttpError } from "@/lib/http";
import type { CatalogVersion } from "./types";

/** ManifestSigner (ARCHITECTURE section 2): Ed25519 over a canonical payload. Env key now, OpenBao later. */
export interface ManifestSigner {
  sign(payload: string): string;
  verify(payload: string, sig: string): boolean;
}

export function createEd25519Signer(privateKey: KeyObject): ManifestSigner {
  const publicKey = createPublicKey(privateKey);
  return {
    sign: (payload) => sign(null, Buffer.from(payload), privateKey).toString("base64url"),
    verify: (payload, sig) => {
      try {
        return verify(null, Buffer.from(payload), publicKey, Buffer.from(sig, "base64url"));
      } catch {
        return false;
      }
    },
  };
}

export const generateTestSigner = () => createEd25519Signer(generateKeyPairSync("ed25519").privateKey);

let devSigner: ManifestSigner | undefined;
/** MANIFEST_SIGNING_KEY (PKCS#8 PEM). Without it a real deployment refuses; dev and the memory stub use an ephemeral per process key. */
export function envManifestSigner(): ManifestSigner {
  const pem = env().MANIFEST_SIGNING_KEY?.replace(/\\n/g, "\n");
  if (pem) return createEd25519Signer(createPrivateKey(pem));
  if (isProd() && dbDriver() !== "memory") throw new HttpError(503, "manifest_signing_unavailable");
  return (devSigner ??= generateTestSigner());
}

/** Canonical payload: stable key order over everything that decides what gets installed. */
export function manifestPayload(v: Pick<CatalogVersion, "appSlug" | "version" | "arch" | "sha256" | "signer" | "detection" | "installCmd" | "uninstallCmd" | "setupFile">): string {
  return JSON.stringify({
    app: v.appSlug, version: v.version, arch: v.arch, sha256: v.sha256, signer: { subject: v.signer.subject, thumbprint: v.signer.thumbprint },
    detection: v.detection, installCmd: v.installCmd, uninstallCmd: v.uninstallCmd, setupFile: v.setupFile,
  });
}

export const signVersion = (signer: ManifestSigner, v: CatalogVersion) => signer.sign(manifestPayload(v));
export const verifyVersionManifest = (signer: ManifestSigner, v: CatalogVersion) => !!v.manifestSig && signer.verify(manifestPayload(v), v.manifestSig);
