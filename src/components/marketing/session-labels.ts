/** Pure label logic for session-aware marketing links. */
export const APP_HOME = "/app";
export const OPEN_APP_LABEL = "Open your dock";

export interface CtaLink { href: string; label: string }

/** The call to action for a visitor: signed-in visitors go straight to the app, whatever the signup label was. */
export function ctaFor(signedIn: boolean, signedOut: CtaLink): CtaLink {
  return signedIn ? { href: APP_HOME, label: OPEN_APP_LABEL } : signedOut;
}

/** Pricing row button. Free plan opens the app; paid plans go to billing with the plan preselected. */
export function pricingCtaFor(signedIn: boolean, plan: { id: string; cta: string; free: boolean }, interval: string, signedOut: CtaLink): CtaLink {
  if (!signedIn) return signedOut;
  if (plan.free) return { href: APP_HOME, label: OPEN_APP_LABEL };
  return { href: `/app/billing?plan=${plan.id}&interval=${interval}`, label: plan.cta };
}
