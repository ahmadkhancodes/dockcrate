import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { Notice } from "@/components/ui/states";
import { CatalogSearch } from "@/components/dock/catalog-search";
import { product } from "@/config/product";

const title = "Public catalog";
const description = "Search the apps DockCrate by BufferSol packages for Intune, with the version, last tested date and QA log for each. Sample list until the live catalog ships.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/catalog" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/catalog" },
};

export default function CatalogPage() {
  return (
    <Section labelledBy="catalog-title" className="pt-24 md:pt-32">
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 id="catalog-title" className="heading-3 md:heading-1 text-text">Search the catalog. Open the QA log.</h1>
        <p className="body-3 text-text-subtle md:title-1">Every version lists its inspection tag and a QA log you can read without logging in.</p>
      </div>
      <div className="mt-8 max-w-3xl">
        <Notice tone="warning" title="Sample list">
          This is a sample list of 6 apps, with illustrative versions and dates. The live catalog, with real verified versions and counts, ships in milestone M2.
        </Notice>
      </div>
      <div className="mt-12"><CatalogSearch /></div>
      <p className="mt-8 max-w-2xl caption-2 text-text-subtle">Catalog metadata comes from the MIT licensed winget-pkgs repository. App names and logos belong to their vendors.</p>
    </Section>
  );
}
