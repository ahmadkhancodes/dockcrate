/**
 * THE single source of product identity, plans, limits, flags and copy constants.
 * KIT_COPY.md step 2: a new product edits this file (and the tokens in globals.css) and nothing else in src/lib.
 */

export type PlanId = "free" | "starter" | "professional" | "business" | "fleet";
export type Interval = "month" | "year";
/** The billing meter is managed devices; the others are plan limits. UNLIMITED marks no cap. */
export type MeterId = "devices" | "tenants" | "catalog_apps" | "custom_apps";
export const UNLIMITED = 1_000_000;

export interface PlanPrice {
  interval: Interval;
  /** USD cents. Real prices only (playbook §2). */
  usd: number;
  /** Stripe lookup key, always `${product.slug}_${plan}_${interval}` (app isolation, C-28). */
  lookupKey: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Empty for the free plan. */
  prices: PlanPrice[];
  limits: Record<MeterId, number>;
  /** Short plain-text differences shown in the pricing table. */
  highlights: string[];
  cta: string;
  featured?: boolean;
  /** Education / non-profit monthly price in cents (proof of status required). */
  educationUsd?: number;
  /** Days of trial. 0 = no trial (DockCrate: the Free plan is the trial). */
  trialDays: number;
}

const slug = "dockcrate";
const price = (plan: PlanId, interval: Interval, usd: number): PlanPrice => ({
  interval,
  usd,
  lookupKey: `${slug}_${plan}_${interval === "month" ? "monthly" : "annual"}`,
});

export const product = {
  slug,
  name: "DockCrate",
  fullName: "DockCrate by BufferSol",
  company: "BufferSol Technologies",
  companyUrl: "https://buffersoltech.com",
  host: "dockcrate.buffersoltech.com",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://dockcrate.buffersoltech.com",
  supportEmail: "contact@buffersoltech.com",
  legalEmail: "contact@buffersoltech.com",
  mailFrom: "DockCrate <hello@dockcrate.buffersoltech.com>",
  description:
    "MSP-first Intune app packaging and patching. No app version publishes until its hash, signer and malware scan checks pass, and a version without a clean-VM install test stays in the Pilot ring. It is published to your own Intune tenant as a Win32 app and kept updated through Pilot and Broad rings with auto-pause and one-click rollback.",
  tagline: "Third-party apps for Intune, packaged, inspected and shipped in rings.",
  /** Legal entity details used by the legal templates. */
  legal: {
    entity: "BufferSol Technologies LLC",
    jurisdiction: "the State of New York, United States",
    address: "447 W Broadway, 2nd Floor Suite #1964, New York, NY 10013, United States",
    effectiveDate: "2026-11-05",
  },
  subProcessors: [
    { name: "Vercel Inc.", purpose: "Hosting and edge network", location: "United States" },
    { name: "MongoDB Inc. (Atlas)", purpose: "Database hosting", location: "United States (AWS us-east-1)" },
    { name: "Stripe Inc.", purpose: "Payments and invoicing", location: "United States" },
    { name: "Resend Inc.", purpose: "Transactional email until our own mail servers are live", location: "United States" },
    { name: "Cloudflare Inc.", purpose: "DNS and the scheduler that triggers background jobs (no customer content)", location: "United States" },
  ],
  currency: "usd" as const,
  /** Default billing interval shown first in the pricing toggle. */
  defaultInterval: "year" as Interval,
  plans: [
    {
      id: "free",
      name: "Free",
      tagline: "Try it on a small fleet",
      prices: [],
      limits: { devices: 25, tenants: 1, catalog_apps: 15, custom_apps: 0 },
      highlights: ["25 devices", "1 tenant", "15 catalog apps", "Rings and rollback", "Community support"],
      cta: "Start free",
      trialDays: 0,
    },
    {
      id: "starter",
      name: "Starter",
      tagline: "For a first few client tenants",
      prices: [price("starter", "month", 2499), price("starter", "year", 24950)],
      limits: { devices: 100, tenants: 5, catalog_apps: UNLIMITED, custom_apps: 0 },
      highlights: ["100 devices", "5 tenants", "Full catalog", "Rings and rollback", "macOS", "Audit log", "Email support"],
      cta: "Choose Starter",
      trialDays: 0,
    },
    {
      id: "professional",
      name: "Professional",
      tagline: "For MSPs managing many tenants",
      prices: [price("professional", "month", 4999), price("professional", "year", 49950)],
      limits: { devices: 1000, tenants: UNLIMITED, catalog_apps: UNLIMITED, custom_apps: 0 },
      highlights: ["1,000 devices", "Unlimited tenants", "App Sets", "Scheduled windows", "Webhooks", "Client PDF reports"],
      cta: "Choose Professional",
      featured: true,
      educationUsd: 3499,
      trialDays: 0,
    },
    {
      id: "business",
      name: "Business",
      tagline: "For larger managed fleets",
      prices: [price("business", "month", 7499), price("business", "year", 74950)],
      limits: { devices: 2500, tenants: UNLIMITED, catalog_apps: UNLIMITED, custom_apps: 25 },
      highlights: ["2,500 devices", "25 Custom Apps (VM-validated)", "Defender patch queue", "Policy backup", "Priority support"],
      cta: "Choose Business",
      trialDays: 0,
    },
    {
      id: "fleet",
      name: "Fleet",
      tagline: "For the largest MSP fleets",
      prices: [price("fleet", "month", 9999), price("fleet", "year", 99990)],
      limits: { devices: 5000, tenants: UNLIMITED, catalog_apps: UNLIMITED, custom_apps: 100 },
      highlights: ["5,000 devices", "100 Custom Apps", "SSO-enforced RBAC", "99.9% SLA", "Custom quote above 5,000 devices"],
      cta: "Choose Fleet",
      trialDays: 0,
    },
  ] satisfies Plan[],
  /** Grace period after a failed payment (past_due keeps the plan, C-20) before limits fall to Free. */
  graceDays: 14,
  /** Remote flag defaults (overridden by APP_FLAGS env JSON and the Mongo `config` collection). */
  flags: {
    payments_enabled: "on",
    signups_enabled: "on",
    maintenance: "off",
  } as Record<string, string>,
  nav: [
    { href: "/catalog", label: "Catalog" },
    { href: "/pricing", label: "Pricing" },
    { href: "/security", label: "Security" },
    { href: "/compare/pckgr", label: "Compare" },
    { href: "/docs", label: "Docs" },
  ],
} as const;

export type Product = typeof product;
export const plans: readonly Plan[] = product.plans;
export const planById = (id: string): Plan | undefined => plans.find((p) => p.id === id);
export const freePlan = plans.find((p) => p.prices.length === 0) ?? plans[0]!;
export const allLookupKeys = (): string[] => plans.flatMap((p) => p.prices.map((x) => x.lookupKey));
export const planForLookupKey = (key: string | null | undefined): { plan: Plan; price: PlanPrice } | null => {
  if (!key) return null;
  for (const plan of plans) for (const p of plan.prices) if (p.lookupKey === key) return { plan, price: p };
  return null;
};

/**
 * Background cadence. ONE constant: production runs on Vercel Hobby, where the scheduler fires at most once a day
 * (two cron entries) and functions stop at 60 s. Flip to "frequent" only when a faster scheduler (Cloudflare Worker
 * cron or a VPS worker) calls /api/cron/<job> every minute; every public page reads its wording from here.
 */
export const CADENCE_MODE: "daily" | "frequent" = "daily";
const CADENCE_COPY = {
  daily: {
    ringCheck: "once a day",
    ringReadSentence: "Once a day we read install results for Pilot devices.",
    ringPauseWhen: "at the next daily check",
    webhookRetry: "The first attempt is immediate. A failed delivery is retried by the daily run, up to 8 attempts, each after its backoff has passed (30 seconds, 2 minutes, 10 minutes, 30 minutes, 1 hour, 3 hours, 6 hours, 12 hours).",
  },
  frequent: {
    ringCheck: "every minute",
    ringReadSentence: "Every minute we read install results for Pilot devices.",
    ringPauseWhen: "within a minute",
    webhookRetry: "Failed deliveries are retried with backoff at 30 seconds, 2 minutes, 10 minutes, 30 minutes, 1 hour, 3 hours, 6 hours and 12 hours. That is up to 8 attempts.",
  },
} as const;
export const cadence = { mode: CADENCE_MODE, ...CADENCE_COPY[CADENCE_MODE] };

/** Early-access wording shared by the landing page, pricing, sign-in and the form. */
export const earlyAccessCopy = {
  cta: "Get early access",
  pricingCta: "Join early access",
  signInLine: "Microsoft work-account sign-in opens with early access. Use an email link meanwhile.",
  realToday: "Available today: the public catalog with inspection tags and QA logs, the .intunewin packer and the rings model. Coming with early access: publishing into your own Intune tenant.",
};
