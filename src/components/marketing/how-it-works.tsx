import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/components/ui/cn";

export interface Step {
  title: string;
  body: ReactNode;
  /** A UI fragment or code sample, not an icon. */
  visual: ReactNode;
}

/** Three numbered rows on a ruled track: the number in mono in the margin, copy and a real UI fragment alternating sides. */
export function HowItWorks({ title, steps }: { title: ReactNode; steps: Step[] }) {
  return (
    <Section labelledBy="how-title">
      <h2 id="how-title" className="heading-4 md:heading-3 max-w-3xl text-text">{title}</h2>
      <ol className="mt-12 flex flex-col md:mt-16">
        {steps.map((step, i) => (
          <li key={step.title} className="border-t border-border-strong py-12 last:pb-0 md:py-16">
            <Reveal className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
              <p aria-hidden className="font-mono body-4 tnum text-text-muted lg:col-span-1 lg:col-start-1 lg:row-start-1">{String(i + 1).padStart(2, "0")}</p>
              <div className={cn("flex flex-col gap-3 lg:col-span-4", i % 2 === 1 ? "lg:order-3 lg:col-start-9" : "lg:col-start-2")}>
                <h3 className="heading-5 text-text"><span className="sr-only">Step {i + 1}: </span>{step.title}</h3>
                <p className="body-3 text-text-subtle">{step.body}</p>
              </div>
              <div className={cn("min-w-0 lg:col-span-6", i % 2 === 1 ? "lg:order-2 lg:col-start-2 lg:row-start-1" : "lg:col-start-7")}>{step.visual}</div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
