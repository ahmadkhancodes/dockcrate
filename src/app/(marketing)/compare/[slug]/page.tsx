import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/layout";
import { CompareTable } from "@/components/marketing/compare-table";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { CHECKED, comparisonBySlug, comparisons } from "@/content/compare";
import { ogImages, twitterImages } from "@/lib/seo";
import { product } from "@/config/product";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) return {};
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: `/compare/${entry.slug}` },
    openGraph: { title: entry.title, description: entry.description, url: `/compare/${entry.slug}`, images: ogImages() },
    twitter: { card: "summary_large_image", images: twitterImages() },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) notFound();

  return (
    <>
      <Section labelledBy="compare-title" className="pt-24 md:pt-32">
        <div className="flex max-w-2xl flex-col items-start gap-6">
          <h1 id="compare-title" className="heading-3 md:heading-1 text-text">{entry.headline}</h1>
          <p className="body-3 text-text-subtle md:title-1">{entry.intro}</p>
          <ButtonLink href="/sign-in" size="lg">Start free with Microsoft</ButtonLink>
        </div>
        <div className="mt-12 md:mt-16">
          <CompareTable caption={`${product.fullName} compared with ${entry.competitor}`} rowHeader="Compared on" columns={entry.columns} highlightColumn={1} rows={entry.rows.map((r) => ({ label: r.label, values: [...r.values] }))} />
        </div>
        <p className="mt-4 caption-2 text-text-subtle">
          {entry.competitor} facts: <a href={entry.source.href} rel="noopener noreferrer" className="underline underline-offset-4 hover:text-action focus-visible:focus-ring">{entry.source.label}</a>, checked {CHECKED}. Prices are USD list prices.
        </p>
      </Section>
      <Section tone="raised" labelledBy="better-title">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-16">
          <h2 id="better-title" className="heading-4 md:heading-2 text-text lg:col-span-5">Where {entry.competitor} is better</h2>
          <ul className="flex flex-col lg:col-span-7">
            {entry.better.map((b) => (
              <li key={b} className="border-t border-border py-4 body-3 text-text last:border-b">{b}</li>
            ))}
          </ul>
        </div>
      </Section>
      <Faq title="Common questions" items={entry.faq} />
      <FinalCta title="See it on one tenant before you decide." body="The free plan covers 25 devices and 1 tenant, with rings and rollback included." cta={{ href: "/sign-in", label: "Start free with Microsoft" }} note="No card." />
    </>
  );
}
