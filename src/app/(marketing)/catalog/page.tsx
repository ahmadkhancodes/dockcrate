import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { Notice } from "@/components/ui/states";
import { CatalogSearch } from "@/components/dock/catalog-search";
import { product } from "@/config/product";
import { listCatalog } from "@/lib/catalog";
import { toRow } from "@/lib/catalog/view";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const title = "Public catalog";
const description = "Search the apps DockCrate by BufferSol packages for Intune, with the version, last tested date and QA log for each. ";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/catalog" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/catalog" },
};

export default async function CatalogPage() {
  const rows = (await listCatalog(await getDb())).map(toRow);
  return (
    <Section labelledBy="catalog-title" className="pt-24 md:pt-32">
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 id="catalog-title" className="heading-3 md:heading-1 text-text">Search the catalog. Open the QA log.</h1>
        <p className="body-3 text-text-subtle md:title-1">Every version lists its inspection tag and a QA log you can read without logging in.</p>
      </div>
      <div className="mt-8 max-w-3xl">
        <Notice tone="warning" title="Sample catalog">
          The catalog holds {rows.length} seeded sample apps. Versions, hashes and tested dates are illustrative until the live winget sync runs, and no version has run in the Windows test lab yet, so the VM check shows as pending.
        </Notice>
      </div>
      <div className="mt-12"><CatalogSearch rows={rows} /></div>
      <p className="mt-8 max-w-2xl caption-2 text-text-subtle">Catalog metadata comes from the MIT licensed winget-pkgs repository. App names and logos belong to their vendors.</p>
    </Section>
  );
}
