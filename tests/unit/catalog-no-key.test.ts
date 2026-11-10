import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import { generateTestSigner } from "@/lib/catalog/manifest";
import { ogImages, pageMetadata, twitterImages } from "@/lib/seo";

describe("catalog without a signing key in production", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lists the catalog and signs the seed once a signer is available", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MONGODB_URI", "mongodb://fake/x");
    vi.stubEnv("DB_DRIVER", "mongo");
    vi.stubEnv("MANIFEST_SIGNING_KEY", "");
    const { listCatalog, ensureCatalogSeeded } = await import("@/lib/catalog");
    const db = createMemoryDb("dockcrate");
    const rows = await listCatalog(db);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.version.manifestSig === null)).toBe(true);
    await ensureCatalogSeeded(db, generateTestSigner());
    const again = await listCatalog(db);
    expect(again.every((r) => !!r.version.manifestSig)).toBe(true);
  });
});

describe("social images", () => {
  it("page metadata carries og:image and twitter:image", () => {
    const m = pageMetadata({ title: "T", description: "D", path: "/x" });
    expect(JSON.stringify(m.openGraph)).toContain("/opengraph-image");
    expect(ogImages()[0].url).toMatch(/^https?:\/\/.+\/opengraph-image$/);
    expect(twitterImages()[0]).toMatch(/^https?:\/\/.+\/opengraph-image$/);
  });
});
