"use client";
import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { earlyAccessCopy, product, plans, type Interval, type Plan, type PlanPrice } from "@/config/product";
import { buttonClass } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { useSessionState } from "@/lib/auth/use-signed-in";
import { pricingCtaFor } from "./session-labels";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** The price shown for the chosen interval; a plan with only one interval shows that one. */
function priceFor(plan: Plan, interval: Interval): PlanPrice | null {
  if (plan.prices.length === 0) return null;
  return plan.prices.find((p) => p.interval === interval) ?? plan.prices[0] ?? null;
}

/** Whole-percent saving of paying yearly, for every plan that sells both intervals. */
function annualSavings(): { min: number; max: number } | null {
  const pct = plans.flatMap((p) => {
    const m = p.prices.find((x) => x.interval === "month");
    const y = p.prices.find((x) => x.interval === "year");
    return m && y ? [Math.round((1 - y.usd / (m.usd * 12)) * 100)] : [];
  });
  return pct.length ? { min: Math.min(...pct), max: Math.max(...pct) } : null;
}

/** Items from the brief that are v1 or v2 and not shipped yet: tagged until they are. */
const ROADMAP = /macOS|Scheduled windows|Client PDF|Custom Apps|Defender|Policy backup|SSO|SLA/;

const RISK_FREE = "No credit card needed.";
const RISK_PAID = "Cancel anytime from your account.";
const RISK_SIGNED_IN = "Opens billing for your organization.";
const RISK_EARLY = "Early access is by request. No card needed.";

export function PricingTable({ id = "pricing", title, earlyAccess = false }: { id?: string; title?: string; earlyAccess?: boolean }) {
  const [interval, setBilling] = useState<Interval>(product.defaultInterval);
  const signedIn = useSessionState() === "in";
  const saving = annualSavings();
  const education = plans.find((p) => p.educationUsd)?.educationUsd;
  const savingText = saving ? (saving.min === saving.max ? `${saving.max}%` : `${saving.min}% to ${saving.max}%`) : null;
  const options: { id: Interval; label: string }[] = [
    { id: "month", label: "Monthly" },
    { id: "year", label: "Annual" },
  ];

  return (
    <div id={id}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        {title ? <h2 id={`${id}-title`} className="heading-4 md:heading-3 text-text">{title}</h2> : <h2 className="sr-only">Plans</h2>}
        {saving ? (
          <div className="flex flex-col gap-2 md:items-end">
            <div role="group" aria-label="Billing interval" className="inline-flex w-fit rounded-md border border-text bg-surface-raised p-1">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={interval === o.id}
                  onClick={() => setBilling(o.id)}
                  className={cn(
                    "min-h-11 rounded-sm px-4 button-sm transition-colors duration-300 ease-out-kit focus-visible:focus-ring",
                    interval === o.id ? "bg-action text-action-text" : "text-text-subtle hover:text-text",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="caption-2 text-text-subtle">Annual billing saves {savingText} on plans sold both ways.</p>
          </div>
        ) : null}
      </div>

      {/* Rate sheet: one plan per row, read across like a price list on a loading bay wall. */}
      <div className="mt-8 overflow-hidden rounded-lg border-2 border-text bg-surface-raised md:mt-12">
        <div aria-hidden className="hidden grid-cols-12 gap-6 border-b-2 border-text bg-surface-sunken px-6 py-2 lg:grid">
          <span className="label-caps col-span-3 text-text-subtle">Plan</span>
          <span className="label-caps col-span-2 text-text-subtle">Price</span>
          <span className="label-caps col-span-5 text-text-subtle">Included</span>
          <span className="label-caps col-span-2 text-text-subtle">Start</span>
        </div>
        <ul>
          {plans.map((plan) => {
            const price = priceFor(plan, interval);
            const free = !price;
            const out = {
              href: earlyAccess ? `/early-access?plan=${plan.id}` : `/sign-in?plan=${plan.id}&interval=${price?.interval ?? interval}`,
              label: earlyAccess ? earlyAccessCopy.pricingCta : plan.cta,
            };
            const action = pricingCtaFor(signedIn, { id: plan.id, cta: plan.cta, free }, price?.interval ?? interval, out);
            return (
              <li
                key={plan.id}
                className={cn(
                  "grid gap-4 border-b border-border-strong p-4 last:border-b-0 md:px-6 md:py-4 lg:grid-cols-12 lg:gap-6",
                  plan.featured && "bg-mark/40 shadow-[inset_4px_0_0_var(--accent)]",
                )}
              >
                <div className="lg:col-span-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="heading-6 text-text">{plan.name}</h3>
                    {plan.featured ? <span className="whitespace-nowrap rounded-sm bg-accent px-2 caption-3 text-action-text">For MSPs</span> : null}
                  </div>
                  <p className="body-6 mt-1 text-text-subtle">{plan.tagline}</p>
                </div>
                <p className="flex flex-wrap items-baseline gap-x-1 lg:col-span-2 lg:flex-col lg:gap-0">
                  <span className="figure-lg text-text">{free ? "$0" : money(price.usd)}</span>
                  <span className="whitespace-nowrap font-mono caption-4 text-text-subtle">{free ? "free" : `per ${price.interval}`}</span>
                </p>
                <ul className="grid content-start gap-x-6 sm:grid-cols-2 lg:col-span-5">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 border-b border-border py-1 body-6 text-text">
                      <Check size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-success" />
                      <span>{h}{ROADMAP.test(h) ? <span className="ml-2 inline-flex rounded-sm border border-border-strong px-1 caption-4 text-text-subtle">Roadmap</span> : null}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2 lg:col-span-2">
                  <Link href={action.href} className={cn(buttonClass(plan.featured ? "primary" : "secondary", "md"), "w-full")}>{action.label}</Link>
                  <p className="caption-2 text-text-subtle">{free ? RISK_FREE : signedIn ? RISK_SIGNED_IN : earlyAccess ? RISK_EARLY : RISK_PAID}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {education ? (
        <p className="mt-8 max-w-2xl body-3 text-text-subtle">
          <strong className="font-semibold text-text">Education and non profit: {money(education)} per month</strong> for the Professional plan, with proof of status. Granted after a manual check. Contact {product.supportEmail}.
        </p>
      ) : null}
    </div>
  );
}
