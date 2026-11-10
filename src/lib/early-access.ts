import { earlyAccessCopy } from "@/config/product";
import { env } from "@/lib/env";

/**
 * Early-access gate. Open (true) while the real-tenant path is closed: when no Microsoft Entra app is registered
 * (ENTRA_CLIENT_ID unset) or when EARLY_ACCESS=1 forces it. When Entra is configured and the flag is not set, nothing changes.
 */
export const earlyAccessOpen = (e = env()): boolean => !e.ENTRA_CLIENT_ID || e.EARLY_ACCESS === "1";

/** Primary call to action for marketing pages. */
export function primaryCta(open = earlyAccessOpen()): { href: string; label: string } {
  return open ? { href: "/early-access", label: earlyAccessCopy.cta } : { href: "/sign-in", label: "Start free with Microsoft" };
}
