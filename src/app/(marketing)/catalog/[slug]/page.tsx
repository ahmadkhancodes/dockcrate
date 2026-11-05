import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Hourglass, X } from "@phosphor-icons/react/dist/ssr";
import { Section } from "@/components/ui/layout";
import { Notice } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { CrateLabel } from "@/components/dock/crate";
import { getCatalogEntry, listVersions } from "@/lib/catalog";
import { isDemoVersion } from "@/lib/catalog/view";
import { InspectionTag } from "@/components/dock/crate";
import { toCrate } from "@/lib/catalog/view";
import { getDb } from "@/lib/db";
import { qaStages, vmPendingNote } from "@/content/security";
import { product } from "@/config/product";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = await getCatalogEntry(await getDb(), slug);
  if (!e) return {};
  const c = { slug: e.app.slug, name: e.app.name, version: e.version.version };
  const title = `${c.name} ${c.version} QA log (sample)`;
  return { title, description: `Sample QA log for ${c.name} ${c.version}: hash, signer, scan and VM checks.`, alternates: { canonical: `/catalog/${c.slug}` }, robots: { index: false }, openGraph: { title: `${title} · ${product.fullName}`, url: `/catalog/${c.slug}` } };
}

const detail: Record<string, (v: string) => string> = {
  Hash: () => "Installer SHA-256 matches the manifest.",
  Signer: () => "Signer matches the previous version.",
  Scan: () => "Scanned with two engines. No detections.",
  VM: () => "Waiting for the Windows test lab. No VM test has run.",
};

export default async function CratePage({ params }: Props) {
  const { slug } = await params;
  const entry = await getCatalogEntry(await getDb(), slug);
  if (!entry) notFound();
  const history = await listVersions(await getDb(), slug);
  const demo = isDemoVersion(entry.version);
  const c = toCrate(entry);
  const v = entry.version;
  const keys = ["hash", "signer", "scan", "vm"] as const;

  return (
    <Section labelledBy="crate-title" className="pt-24 md:pt-32">
      <p className="label-caps text-text-subtle"><Link href="/catalog" className="underline underline-offset-4 hover:text-action focus-visible:focus-ring">Catalog</Link> / {demo ? "Demo QA log" : "QA log"}</p>
      <h1 id="crate-title" className="heading-3 md:heading-1 mt-4 text-text">{c.name} {c.version} {demo ? <span className="ml-2 align-middle rounded-sm border border-border-strong px-2 caption-4 font-normal text-text-subtle">Demo data</span> : null}</h1>
      <div className="mt-8 max-w-3xl"><Notice tone="warning" title="Demo data">This version comes from the seeded demo catalog: the hash, signer and timings are illustrative until the live pipeline runs. The VM check has not run because no Windows test lab is attached.</Notice></div>
      <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-6"><CrateLabel crate={c} /></div>
        <div className="flex flex-col gap-4 lg:col-span-6">
          <p className="font-mono caption-2 text-text-subtle">Last tested {v.testedAt} (sample)</p>
          <ol className="flex flex-col">
            {qaStages.map((s, i) => {
              const state = c.checks[keys[i]!];
              return (
                <li key={s.name} className="grid grid-cols-[1.5rem_1fr] gap-3 border-t border-border py-4 last:border-b">
                  {state === "pass" ? <Check size={20} weight="bold" aria-hidden className="text-success" /> : state === "fail" ? <X size={20} weight="bold" aria-hidden className="text-danger" /> : <Hourglass size={20} weight="bold" aria-hidden className="text-warning" />}
                  <div><p className="title-3 text-text">{s.name}: {state === "pass" ? "passed" : state === "fail" ? "failed" : "pending"}</p><p className="body-6 text-text-subtle">{v.verification.qaLog.find((q) => q.step === keys[i])?.message ?? detail[s.name]?.(c.version)}</p></div>
                </li>
              );
            })}
          </ol>
          {v.verification.heldReason ? <Notice tone="danger" title="Held">{v.verification.heldReason}</Notice> : null}
          <p className="body-6 text-text-subtle">{vmPendingNote}</p>
        </div>
      </div>
      <section aria-labelledby="history-h" className="mt-16 max-w-4xl">
        <h2 id="history-h" className="heading-5 text-text">Version history</h2>
        <p className="body-6 mt-2 text-text-subtle">Every version we have checked, newest first, each with its own inspection tag and QA log.{history.length === 1 ? " Only one version has been checked so far." : ""}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {history.map((h) => (
            <li key={h.id} className="rounded-md border border-border bg-surface-raised">
              <details>
                <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3 px-4 py-3 focus-visible:focus-ring">
                  <span className="font-mono title-4 text-text">{h.version}</span>
                  <InspectionTag checks={h.verification.checks} />
                  <span className="font-mono caption-2 text-text-subtle">Tested {h.testedAt}</span>
                  {isDemoVersion(h) ? <span className="rounded-sm border border-border-strong px-1.5 caption-5 text-text-subtle">Demo data</span> : null}
                  {h.id === entry.version.id ? <span className="caption-4 text-text-subtle">Current</span> : null}
                </summary>
                <ol className="border-t border-border px-4 py-2">
                  {h.verification.qaLog.length === 0 ? <li className="py-2 body-6 text-text-subtle">No QA log yet for this version.</li> : h.verification.qaLog.map((q, i) => (
                    <li key={i} className="grid grid-cols-[5rem_1fr] gap-3 py-2 body-6">
                      <span className="label-caps text-text-subtle">{q.step}</span>
                      <span className="text-text"><span className="font-semibold">{q.result}</span>: {q.message}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-12"><ButtonLink href="/sign-in">Start free with Microsoft</ButtonLink></div>
    </Section>
  );
}
