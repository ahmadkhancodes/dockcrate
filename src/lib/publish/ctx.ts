import { envManifestSigner } from "@/lib/catalog/manifest";
import { graphDriver } from "@/lib/env";
import { BufferInstallerSource, UrlInstallerSource } from "./installer";
import type { PublishCtx } from "./win32";

/** With the fake Graph (stub mode) a placeholder payload is packaged; it never reaches a real tenant. */
export function defaultPublishCtx(): PublishCtx {
  return { installer: graphDriver() === "fake" ? new BufferInstallerSource() : new UrlInstallerSource(), signer: envManifestSigner() };
}
