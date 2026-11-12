import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { ogImages, twitterImages } from "@/lib/seo";
import { product } from "@/config/product";
import { earlyAccessOpen, primaryCta } from "@/lib/early-access";

const title = "Pricing";
const description = "Free, Starter, Professional, Business and Fleet plans, priced by managed device. Rings and rollback on every plan. The free plan is the trial, no card.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/pricing", images: ogImages() },
  twitter: { card: "summary_large_image", images: twitterImages() },
};

const billingFaq = [
  { q: "Which devices count toward my limit?", a: "Managed devices read from Intune across your connected tenants, counted nightly. Devices with no check in for 90 days are excluded." },
  { q: "What happens if I go over my device limit?", a: "You get 14 days to upgrade. Nothing is switched off during that time and your apps keep updating." },
  { q: "What happens if a payment fails?", a: "Your plan stays active for 14 days while Stripe retries. Then the account falls back to the Free plan limits and your data is kept." },
  { q: "Do I need a credit card for the Free plan?", a: "No. The free plan is the trial: 25 devices, 1 tenant, 15 catalog apps, with rings and rollback included." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your account and the plan ends at the period end. Leave your apps in Intune, or remove only the apps prefixed \"DC |\". You can export your data as CSV." },
  { q: "Is there an education price?", a: "Education and non profit organisations pay $34.99 per month for Professional, with proof of status. We approve it by hand." },
];

export default function PricingPage() {
  const open = earlyAccessOpen();
  const cta = primaryCta(open);
  return (
    <>
      <Section labelledBy="pricing-title" className="pt-12 md:pt-20">
        <div className="mb-12 grid border-b-2 border-text pb-8 gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
          <h1 id="pricing-title" className="heading-3 md:heading-1 text-text lg:col-span-8">Priced by managed device, <br className="max-md:hidden" />with rings and rollback on every plan</h1>
          <dl className="flex flex-col border-2 border-text bg-surface-raised lg:col-span-4">
            <div aria-hidden className="hazard h-2 border-b-2 border-text" />
            {[["Free plan", "25 devices, no card"], ["Multi tenant from", "Starter, 5 tenants"], ["Device tiers", "Same as Pckgr"]].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border px-3 py-2 last:border-b-0">
                <dt className="caption-2 text-text-subtle">{k}</dt>
                <dd className="font-mono caption-1 text-text">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <PricingTable earlyAccess={open} />
        <p className="mt-8 caption-2 text-text-subtle">Prices in US dollars. Items tagged Roadmap are planned and not shipped yet.</p>
      </Section>
      <Faq title="Billing questions" items={billingFaq} />
      <FinalCta title="Start on the free plan and add tenants when you need them." cta={cta} note={open ? "Early access is by request." : "The free plan is the trial. No card."} />
    </>
  );
}
