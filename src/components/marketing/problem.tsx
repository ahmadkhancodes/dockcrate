import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";
import { Reveal } from "@/components/ui/reveal";

/** The pain in the buyer's words: a ruled by hand checklist with the repeat count, set against the one DockCrate line. */
export function Problem({ title, body, steps, ours, source }: { title: ReactNode; body: ReactNode; steps: string[]; ours: string; source: ReactNode }) {
  return (
    <Section tone="raised" labelledBy="problem-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-4 lg:col-span-5">
          <h2 id="problem-title" className="heading-4 md:heading-3 text-text">{title}</h2>
          <p className="body-3 text-text-subtle">{body}</p>
          <p className="font-mono caption-5 text-text-muted">{source}</p>
        </div>
        <Reveal className="lg:col-span-6 lg:col-start-7">
          <div className="grid overflow-hidden rounded-lg border border-border-strong bg-surface-raised sm:grid-cols-2">
            <div className="border-b border-border p-6 sm:border-b-0 sm:border-r">
              <p className="label-caps text-text-subtle">By hand, per version, per tenant</p>
              <ol className="mt-4 flex flex-col">
                {steps.map((s, i) => (
                  <li key={s} className="flex items-baseline gap-3 border-t border-border py-2 first:border-t-0">
                    <span aria-hidden className="w-6 shrink-0 font-mono caption-4 tnum text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="body-5 text-text-subtle line-through decoration-border-strong">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col justify-between gap-6 p-6">
              <p className="label-caps text-text-subtle">With DockCrate by BufferSol</p>
              <p className="heading-5 text-text"><span className="rounded-sm bg-mark px-1 text-on-mark">{ours}</span></p>
              <p className="caption-2 text-text-subtle">Then every tenant on the same ring settings gets the next version without another upload.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
