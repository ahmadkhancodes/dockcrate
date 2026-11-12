"use client";
import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { earlyAccessCopy, product, plans, type Interval, type Plan, type PlanPrice } from "@/config/product";
import { buttonClass } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/components/ui/cn";

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

export function PricingTable({ id = "pricing", title, earlyAccess = false }: { id?: string; title?: string; earlyAccess?: boolean }) {
  const [interval, setBilling] = useState<Interval>(product.defaultInterval);
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
        {title ? <h2 id={`${id}-title`} className="heading-4 md:heading-3 text-text">{title}</h2> : <span />}
        {saving ? (
          <div className="flex flex-col gap-2 md:items-end">
            <div role="group" aria-label="Billing interval" className="inline-flex w-fit rounded-md border border-border-strong bg-surface p-1">
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

      <ul className="mt-8 grid overflow-hidden rounded-lg border border-border-strong bg-surface-raised md:mt-12 md:grid-cols-2 xl:grid-cols-5">
        {plans.map((plan) => {
          const price = priceFor(plan, interval);
          const free = !price;
          const href = earlyAccess ? `/early-access?plan=${plan.id}` : `/sign-in?plan=${plan.id}&interval=${price?.interval ?? interval}`;
          return (
            <li
              key={plan.id}
              className={cn(
                "-mb-px -mr-px grid grid-rows-[auto_auto_auto_auto_1fr] border-b border-r border-border p-6 xl:row-span-5 xl:grid-rows-subgrid",
                plan.featured ? "bg-surface" : "bg-surface-raised",
              )}
            >
              <div className="pb-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="heading-6 text-text">{plan.name}</h3>
                  {plan.featured ? <span className="whitespace-nowrap rounded-sm bg-mark px-2 caption-3 text-on-mark">For MSPs</span> : null}
                </div>
                <p className="body-6 mt-1 text-text-subtle">{plan.tagline}</p>
              </div>
              <p className="flex flex-wrap items-baseline gap-x-1 pb-6">
                <span className="figure-lg text-text">{free ? "$0" : money(price.usd)}</span>
                <span className="whitespace-nowrap font-mono caption-4 text-text-subtle">{free ? "free" : `per ${price.interval}`}</span>
              </p>
              <div className="pb-3">
                <Link href={href} className={cn(buttonClass(plan.featured ? "primary" : "secondary", "md"), "w-full")}>{earlyAccess ? earlyAccessCopy.pricingCta : plan.cta}</Link>
              </div>
              <p className="caption-2 pb-6 text-text-subtle">{free ? RISK_FREE : RISK_PAID}</p>
              <ul className="flex flex-col border-t border-border pt-3">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 border-b border-border py-2 body-6 text-text last:border-b-0">
                    <Check size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-success" />
                    <span>{h}{ROADMAP.test(h) ? <span className="ml-2 inline-flex rounded-sm border border-border-strong px-1 caption-4 text-text-subtle">Roadmap</span> : null}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {education ? (
        <p className="mt-8 max-w-2xl body-3 text-text-subtle">
          <strong className="font-semibold text-text">Education and non profit: {money(education)} per month</strong> for the Professional plan, with proof of status. Granted after a manual check. Contact {product.supportEmail}.
        </p>
      ) : null}
    </div>
  );
}
