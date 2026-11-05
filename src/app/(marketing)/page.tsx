import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import {
  CompareTable, Faq, Features, FinalCta, Hero, HowItWorks, Problem, TaglineReveal,
  type FaqItem, type Feature, type Step,
} from "@/components/marketing";
import { PermissionTable } from "@/components/marketing/trust";
import { BayTrack, CheckChips, CrateLabel, CrateMonogram, DemoNote, InspectionTag } from "@/components/dock/crate";
import { DockOverview, HeroDock } from "@/components/dock/dock-preview";
import { freePlan, plans, product } from "@/config/product";
import { CHECKED } from "@/content/compare";
import { demoCrates, type Checks } from "@/content/demo";
import { qaStages, vmPendingNote } from "@/content/security";

const title = "Intune app packaging and patching for MSPs";
const description = "Third-party apps for Intune, packaged, inspected and shipped in rings. Multi-tenant from $24.99/mo. Free plan, no card.";

export const metadata: Metadata = {
  title: { absolute: `${title} | ${product.fullName}` },
  description,
  alternates: { canonical: "/" },
  openGraph: { title: `${title} | ${product.fullName}`, description, url: "/" },
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const freeLine = `Free plan: ${freePlan.limits.devices} devices, ${freePlan.limits.tenants} tenant, ${freePlan.limits.catalog_apps} apps. Rings and rollback included. No card.`;

const steps: Step[] = [
  {
    title: "Connect a tenant",
    body: "You'll need a Global Admin for one click. Not you? Send them this link. The tenant shows as Connected within 60 seconds.",
    visual: (
      <div className="rounded-md border border-border bg-surface-raised p-4 md:p-6">
        <p className="label-caps text-text-subtle">Consent summary</p>
        <p className="heading-6 mt-1 uppercase text-text">3 permissions</p>
        <ul className="mt-3 flex flex-col">
          {["DeviceManagementApps.ReadWrite.All", "DeviceManagementManagedDevices.Read.All", "Group.Read.All"].map((p) => (
            <li key={p} className="border-t border-border py-2 font-mono caption-2 break-all text-text first:border-t-0">{p}</li>
          ))}
        </ul>
        <p className="mt-3 caption-2 text-text-subtle">Status: Waiting for admin, then Connected.</p>
      </div>
    ),
  },
  {
    title: "Pick your rings",
    body: "Choose a Pilot and a Broad group. Defaults: Pilot 0 h, Broad 48 h. A ring pauses itself when more than 10% of its devices fail.",
    visual: (
      <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4 md:p-6">
        <BayTrack bays={["done", "active", "idle"]} />
        <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div><dt className="label-caps text-text-subtle">Bay 1, Pilot</dt><dd className="font-mono body-5 text-text">Delay 0 h</dd></div>
          <div><dt className="label-caps text-text-subtle">Bay 2, Broad</dt><dd className="font-mono body-5 text-text">Delay 48 h</dd></div>
          <div className="col-span-2"><dt className="label-caps text-text-subtle">Auto pause</dt><dd className="font-mono body-5 text-text">Over 10% failed installs</dd></div>
        </dl>
      </div>
    ),
  },
  {
    title: "Publish and let it update",
    body: "Search an app, publish, and it shows up in Intune. New versions go to Pilot first, then Broad, or pause themselves. Target: search to published in under 120 s median.",
    visual: (
      <ul className="rounded-md border border-border bg-surface-raised">
        {demoCrates.slice(0, 3).map((c) => (
          <li key={c.slug} className="grid grid-cols-[1fr_6rem] items-center gap-4 border-b border-border p-4 last:border-b-0">
            <span className="flex min-w-0 items-center gap-3"><CrateMonogram name={c.name} /><span className="min-w-0"><span className="block truncate title-4 text-text">{c.name}</span><span className="font-mono caption-5 text-text-subtle">{c.version}</span></span></span>
            <BayTrack bays={c.bays} />
          </li>
        ))}
      </ul>
    ),
  },
];

const features: Feature[] = [
  { title: "Rings and rollback on every plan", span: 4, body: "Roll back to any of the last 3 versions in one click. The audit log records who did it and when.", visual: <div className="p-4"><BayTrack bays={["done", "paused", "idle"]} /></div> },
  { title: "Multi tenant from the first paid plan", span: 2, body: "Starter covers 5 tenants. App Sets push a baseline of apps and ring defaults to many tenants at once." },
  { title: "Update only variants", span: 2, body: "Published as a requirement script app, so it never installs where the app is absent." },
  { title: "Audit log you can export", span: 2, body: "Every user and system action with actor, IP and time, as CSV." },
  { title: "Three permissions, each explained", span: 2, body: <>The table is on the <Link href="/security" className="underline underline-offset-4 hover:text-action focus-visible:focus-ring">security page</Link>, with what each one does not allow.</> },
];

const faq: FaqItem[] = [
  { q: "Another vendor with write access to all my tenants?", a: "We ask for 3 Graph permissions and the security page lists what each allows and does not allow. Every version has a public QA log, no login. Publisher verification with Microsoft Partner Center is in progress and we will show its status on the security page." },
  { q: "Will you be around in two years?", a: "DockCrate by BufferSol is a BufferSol Technologies product. Apps we publish stay in your Intune if you cancel, and you can export your data as CSV at any time." },
  { q: "Do I have Enterprise App Management?", a: "It is included in Microsoft 365 E5. It is not in E3 or Business Premium, where it is an add on. A three question checker is planned." },
  { q: "What about winget supply chain risk?", a: "Every version passes four checks: hash, signer, scan and VM. New versions go to Pilot first, Broad waits 48 h by default, and a ring pauses itself when installs fail." },
  { q: "Why not free IntuneGet or Robopack's free tier?", a: "Both have real strengths: IntuneGet is free and open source, and Robopack has a bigger catalog. We add support, multi tenant operations for MSPs, and rings with rollback on every plan." },
  { q: "What happens to my apps if I cancel?", a: "Leave them in Intune, or remove only the apps prefixed \"DC |\". You can export your data as CSV." },
  { q: "Which Windows apps, and how many?", a: "The catalog size shown is the real verified count at launch. The MVP target is 200 verified apps. Unknown installer types go to manual review and are never guessed." },
  { q: "Is there an agent or RMM?", a: "No. DockCrate by BufferSol works through Intune only." },
];

const demoChecks: Checks = { hash: "pass", signer: "pass", scan: "pass", vm: "pending" };

export default function HomePage() {
  const sevenZip = demoCrates[1]!;
  return (
    <>
      <Hero
        eyebrow="Works with Microsoft Intune"
        title={<>Third-party apps for Intune, packaged, inspected and shipped in <span className="text-action">rings</span></>}
        subtitle="Multi-tenant from $24.99/mo. Every version hash-checked, scanned and test-installed before it reaches a single device."
        primaryCta={{ href: "/sign-in", label: "Start free with Microsoft" }}
        secondaryCta={{ href: "/catalog", label: "Browse the public catalog" }}
        note={freeLine}
        proof={[
          { value: "3", label: "Graph permissions, each explained" },
          { value: "4", label: "checks before a version ships" },
          { value: "48 h", label: "default Broad ring delay" },
        ]}
        visual={<HeroDock />}
      />

      <Section tone="raised" labelledBy="dock-title">
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="label-caps text-text-subtle">Dock overview</p>
          <h2 id="dock-title" className="heading-4 md:heading-2 text-text">One board for every tenant. Every crate has a tag you can open.</h2>
          <p className="body-3 text-text-subtle">Rows show where each app version sits: on the dock, in Bay 1 (Pilot) or in Bay 2 (Broad). Open a row to read the QA log behind the tag.</p>
        </div>
        <div className="mt-12 md:mt-16"><DockOverview /></div>
      </Section>

      <Problem
        title="Every vendor update is another .intunewin to build, test, upload and assign."
        body="Intune can deploy Windows apps, but each third party app needs a packaged Win32 wrapper, install and uninstall commands and a detection rule, repackaged for every vendor update. Small teams repackage 5 to 10 apps a month. Multiply by your tenants."
        steps={["Package", "Test", "Upload", "Assign", "Repeat for the next tenant"]}
        ours="Search, publish, done"
        source={<>Source: Recast, 4 to 12 hours per manually packaged app including testing.</>}
      />

      <TaglineReveal text="Autopatch handles Microsoft. DockCrate by BufferSol handles everything else, tested before it ships." label="Autopatch and DockCrate" />

      <HowItWorks title="Three steps from a new tenant to a full dock" steps={steps} />

      <Section tone="raised" labelledBy="tag-title">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-6">
            <CrateLabel crate={sevenZip} />
            <DemoNote />
          </div>
          <div className="flex flex-col gap-6 lg:col-span-6">
            <h2 id="tag-title" className="heading-4 md:heading-2 text-text">Four checks before any version reaches a device</h2>
            <ol className="flex flex-col">
              {qaStages.map((s) => (
                <li key={s.name} className="grid grid-cols-[5rem_1fr] gap-4 border-t border-border py-3 last:border-b">
                  <span className="heading-6 uppercase text-text">{s.name}</span>
                  <span className="body-3 text-text-subtle">{s.rule}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-3"><InspectionTag checks={demoChecks} /><CheckChips checks={demoChecks} /></div>
              <p className="body-6 text-text-subtle">{vmPendingNote}</p>
            </div>
            <p className="body-2 text-text">Every version has a public QA log. No login. <Link href="/catalog/7-zip" className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4 hover:text-action focus-visible:focus-ring">Read a sample QA log <ArrowRight size={16} aria-hidden /></Link></p>
          </div>
        </div>
      </Section>

      <Features title="What you get on every plan, and what you get as you grow" items={features} />

      <Section labelledBy="security-title">
        <div className="flex max-w-3xl flex-col gap-4">
          <h2 id="security-title" className="heading-4 md:heading-2 text-text">Another vendor with write access to your tenants? Read exactly what we ask for.</h2>
          <p className="body-3 text-text-subtle">We ask for 3 permissions. Here is exactly what each one lets us do, and what it doesn&apos;t.</p>
        </div>
        <div className="mt-12"><PermissionTable /></div>
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">Publisher verification with Microsoft Partner Center is pending. SOC 2 Type 1 is on the roadmap. We do not claim any certification today.</p>
        <p className="mt-4 flex flex-wrap gap-x-6">
          <Link href="/security" className="inline-flex min-h-11 items-center gap-1 button-sm underline underline-offset-4 hover:text-action focus-visible:focus-ring">Security page <ArrowRight size={16} aria-hidden /></Link>
          <Link href="/legal/dpa" className="inline-flex min-h-11 items-center button-sm underline underline-offset-4 hover:text-action focus-visible:focus-ring">Data processing agreement</Link>
          <Link href="/catalog/7-zip" className="inline-flex min-h-11 items-center button-sm underline underline-offset-4 hover:text-action focus-visible:focus-ring">Sample QA log</Link>
        </p>
      </Section>

      <Section tone="raised" labelledBy="compare-title">
        <div className="flex max-w-3xl flex-col gap-4">
          <h2 id="compare-title" className="heading-4 md:heading-2 text-text">Robopack has a bigger catalog. IntuneGet is free. Here&apos;s when we&apos;re the better pick.</h2>
          <p className="caption-2 text-text-subtle">Competitor facts checked {CHECKED}.</p>
        </div>
        <div className="mt-12">
          <CompareTable
            caption="DockCrate by BufferSol against three alternatives"
            rowHeader="Alternative"
            columns={["What they offer", "DockCrate by BufferSol"]}
            highlightColumn={1}
            rows={[
              { label: "Pckgr Starter (pckgr.com)", values: ["$49/mo, single tenant", "Starter $24.99/mo, 5 tenants"] },
              { label: "Microsoft Enterprise App Management", values: ["Included in M365 E5. An add on at $2 to $5 per user per month for E3 and Business Premium. No rings or rollback.", "Rings and rollback on every plan"] },
              { label: "IntuneGet", values: ["Free and open source, no SLA", "Paid plans with support, free plan for 25 devices"] },
            ]}
          />
        </div>
        <p className="mt-6 flex flex-wrap gap-x-6">
          <Link href="/compare/pckgr" className="inline-flex min-h-11 items-center gap-1 button-sm underline underline-offset-4 hover:text-action focus-visible:focus-ring">Where Pckgr is better <ArrowRight size={16} aria-hidden /></Link>
        </p>
      </Section>

      <Section labelledBy="price-title">
        <div className="flex max-w-3xl flex-col gap-4">
          <h2 id="price-title" className="heading-4 md:heading-2 text-text">Roughly half the price of the tools you&apos;re comparing us with. Same device tiers, so you can check.</h2>
        </div>
        <ul className="mt-12 grid border border-border bg-surface-raised md:grid-cols-5">
          {plans.map((p) => {
            const m = p.prices.find((x) => x.interval === "month");
            return (
              <li key={p.id} className={`flex flex-col gap-1 border-b border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 ${p.featured ? "bg-surface-sunken" : ""}`}>
                <p className="heading-6 uppercase text-text">{p.name}</p>
                <p className="heading-4 tnum text-text">{m ? money(m.usd) : "$0"}<span className="body-6 text-text-subtle">{m ? "/mo" : ""}</span></p>
                <p className="font-mono caption-2 text-text-subtle">{p.limits.devices.toLocaleString("en-US")} devices</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
          <ButtonLink href="/pricing" variant="secondary">See every plan</ButtonLink>
          <p className="caption-2 text-text-subtle">The free plan is the trial. No card.</p>
        </div>
      </Section>

      <Faq title="Questions, answered" items={faq} />

      <FinalCta
        title="Your dock is empty. Start with the 5 apps your devices already have."
        cta={{ href: "/sign-in", label: "Start free with Microsoft" }}
        note={freeLine}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: product.fullName,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
