"use client";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { useSessionState } from "@/lib/auth/use-signed-in";
import { ctaFor, type CtaLink } from "./session-labels";

/** Same button as the signed-out one; only the label and target swap once the session is known. */
export function SessionButtonLink({ cta, size, variant, children }: { cta: CtaLink; size?: "sm" | "md" | "lg"; variant?: "primary" | "inverse"; children?: ReactNode }) {
  const next = ctaFor(useSessionState() === "in", cta);
  return <ButtonLink href={next.href} size={size} variant={variant}>{next.label}{children}</ButtonLink>;
}
