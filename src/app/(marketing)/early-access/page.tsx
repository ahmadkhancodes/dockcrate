import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/layout";
import { earlyAccessCopy, product } from "@/config/product";
import { ogImages, twitterImages } from "@/lib/seo";
import { EarlyAccessForm } from "./early-access-form";

const title = "Get early access";
const description = "Tell us about your Windows fleet. Early access opens publishing into your own Intune tenant.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/early-access" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/early-access", images: ogImages() },
  twitter: { card: "summary_large_image", images: twitterImages() },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function EarlyAccessPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const plan = typeof sp.plan === "string" && /^[a-z]{3,20}$/.test(sp.plan) ? sp.plan : undefined;
  return (
    <Section labelledBy="ea-title" className="pt-24 md:pt-32">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-6">
          <h1 id="ea-title" className="heading-3 md:heading-1 text-text">Get early access</h1>
          <p className="body-3 text-text-subtle md:title-1">Publishing into your own Intune tenant opens with early access. Tell us about your fleet and we connect you first.</p>
          <p className="body-4 text-text-subtle">{earlyAccessCopy.realToday}</p>
          <p className="body-6 text-text-subtle">Meanwhile, <Link href="/catalog" className="underline underline-offset-4 hover:text-action focus-visible:focus-ring">browse the public catalog</Link> and read any QA log, no login.</p>
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <EarlyAccessForm plan={plan} />
        </div>
      </div>
    </Section>
  );
}
