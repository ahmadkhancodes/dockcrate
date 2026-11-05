import type { ReactNode } from "react";
import { Check, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Section } from "@/components/ui/layout";
import { Reveal } from "@/components/ui/reveal";

/** Left statement, right a stepped by hand checklist set against the single DockCrate line. */
export function Problem({ title, body, steps, ours, source }: { title: ReactNode; body: ReactNode; steps: string[]; ours: string; source: ReactNode }) {
  return (
    <Section tone="raised" labelledBy="problem-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col gap-4 lg:col-span-6">
          <h2 id="problem-title" className="heading-4 md:heading-2 text-text">{title}</h2>
          <p className="body-3 text-text-subtle">{body}</p>
          <p className="caption-2 text-text-subtle">{source}</p>
        </div>
        <Reveal className="flex flex-col gap-4 lg:col-span-5 lg:col-start-8">
          <div className="rounded-md border border-border bg-surface p-6">
            <p className="label-caps text-text-subtle">By hand, per app version, per tenant</p>
            <ol className="mt-4 flex flex-col">
              {steps.map((s, i) => (
                <li key={s} className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
                  <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-sm border border-border-strong font-mono caption-4 text-text-subtle">{i + 1}</span>
                  <span className="body-2 text-text">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex items-center gap-3 rounded-md border-2 border-dashed border-action bg-surface p-6">
            <Check size={24} aria-hidden className="shrink-0 text-action" />
            <p className="heading-5 text-text">{ours}</p>
            <ArrowRight size={20} aria-hidden className="ml-auto shrink-0 text-text-subtle" />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
