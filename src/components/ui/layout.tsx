import type { ReactNode } from "react";
import { cn } from "./cn";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/**
 * Marketing section. Rhythm varies on purpose (docs/design-brief.md section 6): `pad` picks the vertical rhythm.
 * Tones: `base` is poured concrete, `raised` the lighter panel band between graphite rules, `inverse` the single graphite band.
 */
export function Section({ id, tone = "base", pad = "lg", className, children, labelledBy }: { id?: string; tone?: "base" | "raised" | "inverse"; pad?: "sm" | "md" | "lg"; className?: string; children: ReactNode; labelledBy?: string }) {
  const t = { base: "bg-surface", raised: "bg-surface-raised border-y border-border-strong", inverse: "bg-surface-inverse text-text-inverse" }[tone];
  const p = { sm: "py-12 md:py-16", md: "py-16 md:py-20", lg: "py-16 md:py-24" }[pad];
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(p, t, className)}>
      <Container>{children}</Container>
    </section>
  );
}
