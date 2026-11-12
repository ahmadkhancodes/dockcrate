import type { ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/layout";

/** Closing action: the same CTA as the hero, on the graphite band, left aligned with the type doing the work. */
export function FinalCta({ title, body, cta, note }: { title: ReactNode; body?: ReactNode; cta: { href: string; label: string }; note?: ReactNode }) {
  return (
    <Section tone="inverse" pad="md" labelledBy="final-cta-title">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-8">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <h2 id="final-cta-title" className="heading-4 md:heading-3 max-w-3xl">{title}</h2>
          {body ? <p className="body-3 max-w-2xl text-border">{body}</p> : null}
        </div>
        <div className="flex flex-col items-start gap-3 lg:col-span-4 lg:items-end">
          <ButtonLink href={cta.href} size="lg" variant="inverse">{cta.label}<ArrowRight size={18} aria-hidden /></ButtonLink>
          {note ? <p className="caption-2 text-border lg:text-right">{note}</p> : null}
        </div>
      </div>
    </Section>
  );
}
