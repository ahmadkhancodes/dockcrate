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

/**
 * Yard hero: the stencilled claim over 8 columns with a crate label plate (the proof) beside it,
 * a graphite rule, then the change sheet at full width. Left aligned, no glow, no centred stack.
 */
export function Hero({ eyebrow, title, subtitle, primaryCta, secondaryCta, note, proof, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="bg-surface pb-16 pt-8 md:pb-24 md:pt-12">
      <Container>
        <div className="grid gap-8 border-b-2 border-text pb-8 lg:grid-cols-12 lg:items-end lg:gap-8 lg:pb-12">
          <div className="flex min-w-0 flex-col items-start gap-6 lg:col-span-8">
            {eyebrow ? <p className="label-caps text-text-subtle">{eyebrow}</p> : null}
            <h1 id="hero-title" className="heading-3 md:heading-1 max-w-4xl font-display text-text">{title}</h1>
          </div>
          {proof ? (
            <div className="self-end border-2 border-text bg-surface-raised lg:col-span-4">
              <div className="flex items-stretch border-b-2 border-text">
                <p className="flex-1 px-3 py-2 label-caps text-text">Crate spec</p>
                <span aria-hidden className="hazard w-16 border-l-2 border-text" />
              </div>
              <dl className="flex flex-col">
                {proof.map((p) => (
                  <div key={p.label} className="flex items-baseline justify-between gap-4 border-b border-border px-3 py-2 last:border-b-0">
                    <dt className="caption-2 text-text-subtle">{p.label}</dt>
                    <dd className="font-mono caption-1 tnum text-text">{p.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
          <p className="body-3 max-w-2xl text-text-subtle md:title-2 lg:col-span-7">{subtitle}</p>
          <div className="flex flex-col items-start gap-3 lg:col-span-5 lg:items-end">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:justify-end">
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="inline-flex min-h-11 items-center rounded-sm button-md text-text underline decoration-accent decoration-2 underline-offset-4 transition-colors duration-300 ease-out-kit hover:text-accent focus-visible:focus-ring max-lg:order-2">
                  {secondaryCta.label}
                </Link>
              ) : null}
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}<ArrowRight size={18} aria-hidden /></ButtonLink>
            </div>
            {note ? <p className="caption-2 max-w-md text-text-muted lg:text-right">{note}</p> : null}
          </div>
        </div>
        <div className="mt-12 min-w-0 md:mt-16">{visual}</div>
      </Container>
    </section>
  );
}
