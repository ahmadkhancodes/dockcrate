import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { PermissionTable, QaPipeline } from "@/components/marketing/trust";
import { FinalCta } from "@/components/marketing/final-cta";
import { vmPendingNote } from "@/content/security";
import { product } from "@/config/product";

const title = "Security";
const description = "The three Microsoft Graph permissions DockCrate by BufferSol asks for, what each allows and does not allow, and the four checks every version passes.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/security" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/security" },
};

const linkClass = "underline underline-offset-4 hover:text-action focus-visible:focus-ring";

export default function SecurityPage() {
  return (
    <>
      <Section labelledBy="security-title" className="pt-24 md:pt-32">
        <div className="flex max-w-3xl flex-col gap-6">
          <h1 id="security-title" className="heading-3 md:heading-1 text-text">Read exactly what we ask for before you grant it</h1>
          <p className="body-3 text-text-subtle md:title-1">We ask for 3 permissions. Here is exactly what each one lets us do, and what it doesn&apos;t. Permissions are application permissions granted by your Global Admin in your own tenant, and we never store customer secrets.</p>
        </div>
        <div className="mt-12"><PermissionTable /></div>
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">Sign in uses delegated User.Read, openid, profile and email on work accounts only. Personal Microsoft accounts are rejected.</p>
      </Section>

      <Section tone="raised" labelledBy="qa-title">
        <div className="flex max-w-3xl flex-col gap-4">
          <h2 id="qa-title" className="heading-4 md:heading-2 text-text">Four checks before a version reaches Bay 1</h2>
          <p className="body-3 text-text-subtle">Every version carries an inspection tag and a QA log you can open without logging in.</p>
        </div>
        <div className="mt-12"><QaPipeline /></div>
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">{vmPendingNote}</p>
        <div className="mt-6"><ButtonLink href="/catalog/7-zip" variant="secondary">Read a sample QA log</ButtonLink></div>
      </Section>

      <Section labelledBy="trust-title">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <h2 id="trust-title" className="heading-4 md:heading-2 text-text lg:col-span-5">What we do and do not claim</h2>
          <ul className="flex flex-col lg:col-span-7">
            {[
              <>Publisher verification with Microsoft Partner Center is pending. Until it completes, the Microsoft consent screen shows the app as unverified.</>,
              <>SOC 2 Type 1 is on the roadmap. We hold no certification today and we publish no uptime figure.</>,
              <>Every app we create in Intune carries the &ldquo;DC |&rdquo; prefix, so you can find it and remove it.</>,
              <>Sub processors are listed in full on the <Link href="/legal/subprocessors" className={linkClass}>sub processors page</Link>. The <Link href="/legal/dpa" className={linkClass}>data processing agreement</Link> and <Link href="/legal/security" className={linkClass}>security policy</Link> are public.</>,
              <>Report a vulnerability to {product.supportEmail}.</>,
            ].map((item, i) => (
              <li key={i} className="border-t border-border py-4 body-3 text-text last:border-b">{item}</li>
            ))}
          </ul>
        </div>
      </Section>
      <FinalCta title="Connect one tenant and read the audit log yourself." cta={{ href: "/sign-in", label: "Start free with Microsoft" }} note="Free plan, no card." />
    </>
  );
}
