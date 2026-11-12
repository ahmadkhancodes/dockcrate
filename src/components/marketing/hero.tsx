import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";

export interface HeroProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle: ReactNode;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  /** Risk line under the CTA. */
  note?: ReactNode;
  /** Facts beside the claim, all taken from the brief. Rendered as a ruled spec list, not a stat strip. */
  proof?: { value: string; label: string }[];
  /** The REAL product UI. Spans the full container under the copy. */
  visual: ReactNode;
}

/** Left aligned hero: the claim over 8 columns, a ruled spec list beside it, then the product at full width. */
export function Hero({ eyebrow, title, subtitle, primaryCta, secondaryCta, note, proof, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="bg-surface-raised pb-16 pt-8 md:pb-24 md:pt-16">
      <Container>
        <div className="flex flex-col items-start gap-6">
          {eyebrow ? <p className="font-mono caption-4 text-text-subtle">{eyebrow}</p> : null}
          <h1 id="hero-title" className="heading-3 md:heading-1 max-w-5xl text-text">{title}</h1>
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-8">
          <div className="flex min-w-0 flex-col items-start gap-6 lg:col-span-7">
            <p className="body-3 max-w-2xl text-text-subtle md:title-2">{subtitle}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}<ArrowRight size={18} aria-hidden /></ButtonLink>
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="inline-flex min-h-11 items-center rounded-sm button-md text-text underline decoration-border-strong underline-offset-4 transition-colors duration-300 ease-out-kit hover:decoration-text focus-visible:focus-ring">
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
            {note ? <p className="caption-2 max-w-xl text-text-muted">{note}</p> : null}
          </div>
          {proof ? (
            <dl className="flex flex-col self-start border-t border-text lg:col-span-4 lg:col-start-9">
              {proof.map((p) => (
                <div key={p.label} className="flex items-baseline justify-between gap-4 border-b border-border py-2">
                  <dt className="caption-2 text-text-subtle">{p.label}</dt>
                  <dd className="font-mono caption-1 tnum text-text">{p.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <div className="mt-12 min-w-0 md:mt-16">{visual}</div>
      </Container>
    </section>
  );
}
