import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";
import { cn } from "@/components/ui/cn";

export type FeatureSpan = 2 | 3 | 4 | 6;
export interface Feature {
  title: string;
  body: ReactNode;
  /** Kept for callers. The first item with a visual becomes the lead; the rest form a ruled list. */
  span?: FeatureSpan;
  visual?: ReactNode;
}

/** One lead item with its UI fragment, then a ruled two column list. Deliberately not a card grid. */
export function Features({ title, intro, items }: { title: ReactNode; intro?: ReactNode; items: Feature[] }) {
  const lead = items.find((f) => f.visual) ?? items[0]!;
  const rest = items.filter((f) => f !== lead);
  return (
    <Section labelledBy="features-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <h2 id="features-title" className="heading-4 md:heading-3 text-text">{title}</h2>
          {intro ? <p className="body-3 text-text-subtle">{intro}</p> : null}
          <div className="flex flex-col gap-4 border-t border-text pt-6">
            <h3 className="heading-6 text-text">{lead.title}</h3>
            <p className="body-3 text-text-subtle">{lead.body}</p>
            {lead.visual ? <div className="min-w-0 overflow-hidden rounded-lg border border-border-strong bg-surface-raised">{lead.visual}</div> : null}
          </div>
        </div>
        <ul className="grid content-start sm:grid-cols-2 sm:gap-x-8 lg:col-span-6 lg:col-start-7">
          {rest.map((f, i) => (
            <li key={f.title} className={cn("flex min-w-0 flex-col gap-2 border-t border-border py-6", i < 2 && "sm:border-text")}>
              <h3 className="title-3 font-semibold text-text">{f.title}</h3>
              <p className="body-6 text-text-subtle">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
