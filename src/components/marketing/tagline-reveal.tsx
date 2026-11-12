"use client";
import { useEffect, useMemo, useRef } from "react";
import { Section } from "@/components/ui/layout";

/** Fraction of the viewport, measured from the bottom, at which a word lights up. */
export const TRIGGER_LINE = "0px 0px -35% 0px";

/**
 * B11 tagline reveal: one large statement whose words start muted (30% of the ink, `.kit-word`) and light up one at a
 * time, in reading order, as each word crosses the trigger line. One IntersectionObserver entry per word, each word
 * revealed once. Under prefers-reduced-motion the CSS shows every word at full ink immediately.
 */
export function TaglineReveal({ text, label }: { text: string; label?: string }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLElement>(".kit-word"));
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const s of spans) s.dataset.on = "true";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const target = e.target as HTMLElement;
          // Reading order: a word never lights before the ones in front of it.
          // Words switched on together (one line crossing at once) step 60ms apart so they still read one by one.
          let step = 0;
          for (const s of spans.slice(0, spans.indexOf(target) + 1)) {
            if (s.dataset.on === "true") continue;
            s.style.transitionDelay = `${step++ * 60}ms`;
            s.dataset.on = "true";
            io.unobserve(s);
          }
        }
      },
      { rootMargin: TRIGGER_LINE, threshold: 1 },
    );
    for (const s of spans) io.observe(s);
    return () => io.disconnect();
  }, [words]);

  return (
    <Section pad="md">
      {label ? <p className="font-mono caption-4 mb-6 text-text-muted">{label}</p> : null}
      <p className="sr-only">{text}</p>
      {/* The animated copy is decorative: assistive tech reads the sentence above in one piece. */}
      <p ref={ref} aria-hidden="true" className="heading-4 md:heading-2 max-w-[680px] text-text">
        {words.map((w, i) => (
          <span key={i} className="kit-word" data-on="false">
            {w}{" "}
          </span>
        ))}
      </p>
    </Section>
  );
}
