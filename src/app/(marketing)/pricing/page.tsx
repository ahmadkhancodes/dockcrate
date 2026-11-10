import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { ogImages, twitterImages } from "@/lib/seo";
import { product } from "@/config/product";

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
  return (
    <>
      <Section labelledBy="pricing-title" className="pt-24 md:pt-32">
        <h1 id="pricing-title" className="heading-3 md:heading-1 mb-12 max-w-3xl text-text">Pricing by managed device. Rings and rollback on every plan.</h1>
        <PricingTable />
        <p className="mt-8 caption-2 text-text-subtle">Prices in US dollars. Items tagged Roadmap are planned and not shipped yet.</p>
      </Section>
      <Faq title="Billing questions" items={billingFaq} />
      <FinalCta title="Start on the free plan and add tenants when you need them." cta={{ href: "/sign-in", label: "Start free with Microsoft" }} note="The free plan is the trial. No card." />
    </>
  );
}
