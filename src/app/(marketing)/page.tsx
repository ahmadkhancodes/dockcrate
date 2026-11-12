import { ogImages, twitterImages } from "@/lib/seo";
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
import { BayTrack, CrateMonogram } from "@/components/dock/crate";
import { DockOverview, HeroDock } from "@/components/dock/dock-preview";
import { cadence, freePlan, plans, product } from "@/config/product";
import { earlyAccessOpen, primaryCta } from "@/lib/early-access";
import { CHECKED } from "@/content/compare";
import { demoCrates } from "@/content/demo";
import { qaStages, vmPendingNote } from "@/content/security";

const title = "Intune app packaging and patching for MSPs";
const description = "Third party apps for Intune, packaged, inspected and shipped in rings. Multi tenant from $24.99/mo. Free plan, no card.";

export const metadata: Metadata = {
  title: { absolute: `${title} | ${product.fullName}` },
  description,
  alternates: { canonical: "/" },
  openGraph: { title: `${title} | ${product.fullName}`, description, url: "/", images: ogImages() },
  twitter: { card: "summary_large_image", images: twitterImages() },
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const freeLine = `Free plan: ${freePlan.limits.devices} devices, ${freePlan.limits.tenants} tenant, ${freePlan.limits.catalog_apps} apps. Rings and rollback included. No card.`;

const steps: Step[] = [
  {
    title: "Connect a tenant",
    body: "You'll need a Global Admin for one click. Not you? Send them this link. The tenant shows as Connected within 60 seconds.",
    visual: (
      <div className="rounded-lg border border-border-strong bg-surface-raised p-4 md:p-6">
        <p className="label-caps text-text-subtle">Admin consent, Halvorsen Dental</p>
        <p className="heading-6 mt-1 text-text">3 permissions requested</p>
        <ul className="mt-3 flex flex-col">
          {["DeviceManagementApps.ReadWrite.All", "DeviceManagementManagedDevices.Read.All", "Group.Read.All"].map((p) => (
            <li key={p} className="border-t border-border py-2 font-mono caption-2 break-all text-text first:border-t-0">{p}</li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-2 caption-2 text-text-subtle"><span aria-hidden className="size-2 rounded-sm bg-warning" />Waiting for admin, then Connected</p>
      </div>
    ),
  },
  {
    title: "Pick your rings",
    body: `Choose a Pilot and a Broad group. Defaults: Pilot 0 h, Broad 48 h. When more than 10% of a ring's devices fail, Broad is paused ${cadence.ringPauseWhen}.`,
    visual: (
      <div className="flex flex-col gap-4 rounded-lg border border-border-strong bg-surface-raised p-4 md:p-6">
        <BayTrack bays={["done", "active", "idle"]} />
        <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div><dt className="label-caps text-text-subtle">Pilot: DC-Pilot</dt><dd className="font-mono body-5 text-text">Delay 0 h</dd></div>
          <div><dt className="label-caps text-text-subtle">Broad: DC-Broad</dt><dd className="font-mono body-5 text-text">Delay 48 h</dd></div>
          <div className="col-span-2"><dt className="label-caps text-text-subtle">Auto pause</dt><dd className="font-mono body-5 text-text">Over 10% failed installs</dd></div>
        </dl>
      </div>
    ),
  },
  {
    title: "Publish and let it update",
    body: "Search an app, publish, and it shows up in Intune. New versions go to Pilot first, then Broad, and Broad pauses when Pilot fails.",
    visual: (
      <ul className="rounded-lg border border-border-strong bg-surface-raised">
        {demoCrates.slice(0, 3).map((c) => (
          <li key={c.slug} className="grid grid-cols-[1fr_8rem] items-center gap-4 border-b border-border p-4 last:border-b-0">
            <span className="flex min-w-0 items-center gap-3"><CrateMonogram name={c.name} /><span className="min-w-0"><span className="block truncate title-4 font-semibold text-text">{c.name}</span><span className="font-mono caption-5 text-text-subtle">{c.version}</span></span></span>
            <span className="flex flex-col gap-1"><BayTrack bays={c.bays} compact /><span className="font-mono caption-5 text-text-subtle">{c.statusLabel}</span></span>
          </li>
        ))}
      </ul>
    ),
  },
];

const features: Feature[] = [
  { title: "Rings and rollback on every plan", span: 4, body: "Roll back to any of the last 3 versions in one click. The audit log records who did it and when.", visual: <div className="flex flex-col gap-3 p-4"><BayTrack bays={["done", "paused", "idle"]} /><p className="flex items-center justify-between gap-3 border-t border-border pt-3 font-mono caption-4 text-text"><span>Zoom Workplace 6.3.1</span><span className="rounded-sm bg-mark px-2 text-on-mark">Roll back to 6.3.0</span></p></div> },
  { title: "Multi tenant from the first paid plan", span: 2, body: "Starter covers 5 tenants. App Sets push a baseline of apps and ring defaults to many tenants at once." },
  { title: "Update only variants", span: 2, body: "Published as a requirement script app, so it never installs where the app is absent." },
  { title: "Audit log you can export", span: 2, body: "Every user and system action with actor, IP and time, as CSV." },
  { title: "Three permissions, each explained", span: 2, body: <>The table is on the <Link href="/security" className="underline underline-offset-4 decoration-border-strong hover:decoration-text focus-visible:focus-ring">security page</Link>, with what each one does not allow.</> },
];

const faq: FaqItem[] = [
  { q: "Another vendor with write access to all my tenants?", a: "We ask for 3 Graph permissions and the security page lists what each allows and does not allow. Every version has a public QA log, no login. Publisher verification with Microsoft Partner Center is in progress and we will show its status on the security page." },
  { q: "Will you be around in two years?", a: "DockCrate by BufferSol is a BufferSol Technologies product. Apps we publish stay in your Intune if you cancel, and you can export your data as CSV at any time." },
  { q: "Do I have Enterprise App Management?", a: "It is included in Microsoft 365 E5. It is not in E3 or Business Premium, where it is an add on. A three question checker is planned." },
  { q: "What about winget supply chain risk?", a: `Every version passes four checks: hash, signer, scan and VM. New versions go to Pilot first, Broad waits 48 h by default, and Broad is paused ${cadence.ringPauseWhen} when Pilot installs fail.` },
  { q: "Why not free IntuneGet or Robopack's free tier?", a: "Both have real strengths: IntuneGet is free and open source, and Robopack has a bigger catalog. We add support, multi tenant operations for MSPs, and rings with rollback on every plan." },
  { q: "What happens to my apps if I cancel?", a: "Leave them in Intune, or remove only the apps prefixed \"DC |\". You can export your data as CSV." },
  { q: "Which Windows apps, and how many?", a: "The catalog size shown is the real verified count at launch. The MVP target is 200 verified apps. Unknown installer types go to manual review and are never guessed." },
  { q: "Is there an agent or RMM?", a: "No. DockCrate by BufferSol works through Intune only." },
];

/** Demo QA log lines for 7-Zip 25.01 (labelled Demo data). The VM line is pending, as it is for every version today (D-01). */
const qaLog: { check: string; detail: string; state: "pass" | "pending" }[] = [
  { check: "hash", detail: "SHA-256 3f9a1c0e…b27d matches the manifest", state: "pass" },
  { check: "signer", detail: "Igor Pavlov, same signer as 24.09", state: "pass" },
  { check: "scan", detail: "0 detections, signatures 3 h old", state: "pass" },
  { check: "vm", detail: "Windows 11 test install not run yet", state: "pending" },
];

const earlyNote = "Early access is by request. Tell us about your fleet and we open your tenant connection.";

export default function HomePage() {
  const sevenZip = demoCrates[1]!;
  const open = earlyAccessOpen();
  const cta = primaryCta(open);
  return (
    <>
      <Hero
        eyebrow="Works with Microsoft Intune · for MSPs and lean IT teams"
        title={<>Patch third party apps{" "}<br className="max-md:hidden" />across every{" "}<br className="max-md:hidden" />Intune tenant</>}
        subtitle="Every version is hash, signer and malware checked, then shipped to Pilot first and Broad 48 h later, with one click rollback. Multi tenant from $24.99/mo."
        primaryCta={cta}
        note={open ? earlyNote : freeLine}
        proof={[
          { value: "$24.99/mo", label: "Starter, 5 tenants" },
          { value: "3", label: "Graph permissions" },
          { value: "4", label: "Checks per version" },
          { value: "0 h / 48 h", label: "Pilot / Broad delay" },
        ]}
        visual={<HeroDock />}
      />

      <Section pad="sm" labelledBy="status-title" className="border-t border-border">
        <div className="grid gap-8 md:grid-cols-12">
          <h2 id="status-title" className="heading-6 text-text md:col-span-3">Where we are, plainly</h2>
          <div className="flex flex-col gap-2 md:col-span-4">
            <p className="label-caps text-success">Available today</p>
            <ul className="flex flex-col body-6 text-text">
              <li className="border-t border-border py-2">The public catalog, with checks and a QA log on every version</li>
              <li className="border-t border-border py-2">The .intunewin packer</li>
              <li className="border-t border-border py-2">The rings model: Pilot, Broad, auto pause and rollback</li>
            </ul>
          </div>
          <div className="flex flex-col gap-2 md:col-span-4 md:col-start-9">
            <p className="label-caps text-text-subtle">{open ? "Coming with early access" : "Connect your tenant"}</p>
            <p className="border-t border-border py-2 body-6 text-text">{open ? "Publishing into your own Intune tenant, with the three Graph permissions listed on the security page. Early access users are connected first." : "Publishing into your own Intune tenant, with the three Graph permissions listed on the security page."}</p>
          </div>
        </div>
      </Section>

      <Section tone="raised" labelledBy="dock-title">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
          <h2 id="dock-title" className="heading-4 md:heading-3 xl:heading-2 text-text lg:col-span-7">One board for every tenant you manage</h2>
          <p className="body-3 text-text-subtle lg:col-span-4 lg:col-start-9">Each row shows where a version sits: ready, in Pilot or in Broad. Open it to read the checks behind it and roll back in one click.</p>
        </div>
        <div className="mt-12 md:mt-16"><DockOverview /></div>
      </Section>

      <Problem
        title="Every vendor update is another .intunewin to build, test, upload and assign"
        body="Intune can deploy Windows apps, but each third party app needs a packaged Win32 wrapper, install and uninstall commands and a detection rule, repackaged for every vendor update. Small teams repackage 5 to 10 apps a month. Multiply by your tenants."
        steps={["Package", "Test", "Upload", "Assign", "Repeat for the next tenant"]}
        ours="Search, publish, done"
        source={<>Source: Recast, 4 to 12 hours per manually packaged app including testing.</>}
      />

      <TaglineReveal text="Autopatch handles Microsoft. DockCrate by BufferSol handles everything else, checked before it ships." label="Autopatch and DockCrate" />

      <HowItWorks title="Three steps from a new tenant to a full dock" steps={steps} />

      <Section tone="inverse" pad="md" labelledBy="tag-title">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col gap-6 lg:col-span-5">
            <h2 id="tag-title" className="heading-4 md:heading-3 xl:heading-2">Four checks before any version reaches a device</h2>
            <ol className="flex flex-col">
              {qaStages.map((s, i) => (
                <li key={s.name} className="grid grid-cols-[2rem_4.5rem_1fr] gap-2 border-t border-text-subtle py-3">
                  <span className="font-mono caption-4 tnum text-border-strong">{String(i + 1).padStart(2, "0")}</span>
                  <span className="body-4">{s.name}</span>
                  <span className="body-6 text-border">{s.rule}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-6 lg:col-start-7">
            <figure className="m-0 overflow-hidden rounded-lg border border-text-subtle bg-text font-mono">
              <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-text-subtle px-4 py-3 caption-4 text-border">
                <span>QA log · {sevenZip.name} {sevenZip.version} · Windows {sevenZip.arch}</span>
                <span className="text-border-strong">Demo data</span>
              </figcaption>
              <ul className="flex flex-col px-4 py-3 caption-2">
                {qaLog.map((l) => (
                  <li key={l.check} className="grid grid-cols-[4rem_1fr_auto] items-baseline gap-3 py-1">
                    <span className="text-border-strong">{l.check}</span>
                    <span className="min-w-0 break-words text-text-inverse">{l.detail}</span>
                    <span className={l.state === "pass" ? "text-mark" : "text-border"}>{l.state}</span>
                  </li>
                ))}
                <li className="mt-2 border-t border-text-subtle pt-3 text-text-inverse">result <span className="text-mark">Pilot only</span> until the VM check runs</li>
              </ul>
            </figure>
            <p className="body-6 text-border">{vmPendingNote}</p>
            <p className="body-5">Every version has a public QA log. No login. <Link href="/catalog/7-zip" className="inline-flex min-h-11 items-center gap-1 text-text-inverse underline decoration-mark underline-offset-4 focus-visible:focus-ring">Read an example QA log <ArrowRight size={16} aria-hidden /></Link></p>
          </div>
        </div>
      </Section>

      <Features title="What you get on every plan, and what you get as you grow" items={features} />

      <Section tone="raised" labelledBy="security-title">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
          <h2 id="security-title" className="heading-4 md:heading-3 text-text lg:col-span-7">Another vendor with write access to your tenants? Read exactly what we ask for</h2>
          <p className="body-3 text-text-subtle lg:col-span-4 lg:col-start-9">We ask for 3 permissions. Here is what each one lets us do, and what it does not.</p>
        </div>
        <div className="mt-12"><PermissionTable /></div>
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">Publisher verification with Microsoft Partner Center is pending. SOC 2 Type 1 is on the roadmap. We do not claim any certification today.</p>
        <p className="mt-4 flex flex-wrap gap-x-6">
          <Link href="/security" className="inline-flex min-h-11 items-center gap-1 button-sm underline decoration-border-strong underline-offset-4 hover:decoration-text focus-visible:focus-ring">Security page <ArrowRight size={16} aria-hidden /></Link>
          <Link href="/legal/dpa" className="inline-flex min-h-11 items-center button-sm underline decoration-border-strong underline-offset-4 hover:decoration-text focus-visible:focus-ring">Data processing agreement</Link>
          <Link href="/catalog/7-zip" className="inline-flex min-h-11 items-center button-sm underline decoration-border-strong underline-offset-4 hover:decoration-text focus-visible:focus-ring">Example QA log</Link>
        </p>
      </Section>

      <Section labelledBy="compare-title">
        <div className="flex max-w-3xl flex-col gap-4">
          <h2 id="compare-title" className="heading-4 md:heading-3 text-text">Robopack has a bigger catalog. IntuneGet is free. Here is when we are the better pick</h2>
          <p className="font-mono caption-5 text-text-muted">Competitor facts checked {CHECKED}</p>
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
          <Link href="/compare/pckgr" className="inline-flex min-h-11 items-center gap-1 button-sm underline decoration-border-strong underline-offset-4 hover:decoration-text focus-visible:focus-ring">Where Pckgr is better <ArrowRight size={16} aria-hidden /></Link>
        </p>
      </Section>

      <Section tone="raised" labelledBy="price-title">
        <div className="flex max-w-3xl flex-col gap-4">
          <h2 id="price-title" className="heading-4 md:heading-3 text-text">About half the price of the tools you are comparing us with, on the same device tiers</h2>
        </div>
        <ul className="mt-12 grid overflow-hidden rounded-lg border border-border-strong bg-surface-raised md:grid-cols-5">
          {plans.map((p) => {
            const m = p.prices.find((x) => x.interval === "month");
            return (
              <li key={p.id} className={`flex flex-col gap-1 border-b border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 ${p.featured ? "bg-surface" : ""}`}>
                <p className="flex items-center justify-between gap-2 title-3 font-semibold text-text">{p.name}{p.featured ? <span className="rounded-sm bg-mark px-2 caption-4 text-on-mark">For MSPs</span> : null}</p>
                <p className="figure-lg text-text">{m ? money(m.usd) : "$0"}<span className="body-6 text-text-subtle">{m ? "/mo" : ""}</span></p>
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
        title="Start with the 5 apps your devices already run"
        cta={cta}
        note={open ? earlyNote : freeLine}
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
