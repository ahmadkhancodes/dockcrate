import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
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
  /** Proof strip: value plus label, all taken from the brief. */
  proof?: { value: string; label: string }[];
  /** The REAL product UI. Sits to the right on desktop and below the copy on mobile. */
  visual: ReactNode;
}

/** Left-aligned hero: claim, one action, proof next to it, the product itself beside it. */
export function Hero({ eyebrow, title, subtitle, primaryCta, secondaryCta, note, proof, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="bg-surface pb-12 pt-24 md:pb-24 md:pt-32">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="flex min-w-0 flex-col items-start gap-6 lg:col-span-6">
            {eyebrow ? (
              <p className="label-caps flex items-center gap-2 text-text-subtle"><ShieldCheck size={16} aria-hidden /> {eyebrow}</p>
            ) : null}
            <h1 id="hero-title" className="heading-3 md:heading-1 text-text">{title}</h1>
            <p className="body-3 max-w-xl text-text-subtle md:title-1">{subtitle}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}</ButtonLink>
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="inline-flex min-h-11 items-center rounded-sm button-md text-text underline underline-offset-4 transition-colors duration-200 ease-out-kit hover:text-action focus-visible:focus-ring">
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
            {note ? <p className="caption-2 text-text-subtle">{note}</p> : null}
            {proof ? (
              <dl className="mt-2 grid w-full grid-cols-3 gap-4 border-t border-border pt-6">
                {proof.map((p) => (
                  <div key={p.label} className="flex flex-col gap-1">
                    <dt className="order-2 caption-2 text-text-subtle">{p.label}</dt>
                    <dd className="heading-4 tnum text-text">{p.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <div className="min-w-0 lg:col-span-6">{visual}</div>
        </div>
      </Container>
    </section>
  );
}
