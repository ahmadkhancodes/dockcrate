import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Hourglass, X } from "@phosphor-icons/react/dist/ssr";
import { Section } from "@/components/ui/layout";
import { Notice } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { CrateLabel } from "@/components/dock/crate";
import { getCatalogEntry } from "@/lib/catalog";
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
  const c = toCrate(entry);
  const v = entry.version;
  const keys = ["hash", "signer", "scan", "vm"] as const;

  return (
    <Section labelledBy="crate-title" className="pt-24 md:pt-32">
      <p className="label-caps text-text-subtle"><Link href="/catalog" className="underline underline-offset-4 hover:text-action focus-visible:focus-ring">Catalog</Link> / Sample QA log</p>
      <h1 id="crate-title" className="heading-3 md:heading-1 mt-4 text-text">{c.name} {c.version}</h1>
      <div className="mt-8 max-w-3xl"><Notice tone="warning" title="Sample QA log">This version comes from the seeded sample catalog: the hash, signer and timings are illustrative until the live pipeline runs. The VM check has not run because no Windows test lab is attached.</Notice></div>
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
      <div className="mt-12"><ButtonLink href="/sign-in">Start free with Microsoft</ButtonLink></div>
    </Section>
  );
}
