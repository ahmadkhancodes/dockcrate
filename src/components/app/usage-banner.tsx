import Link from "next/link";
import { Notice } from "@/components/ui/states";
import type { Entitlement } from "@/lib/db/types";
import { bannerMeter, type UsageState } from "@/lib/billing/usage";
import { product } from "@/config/product";
import { METER_LABELS, fmt } from "./labels";

/** Shown in the app layout when a meter is near/over its limit, or a payment failed. */
export function UsageBanner({ usage, entitlement, graceEndsAt = null, graceExpired = false }: { usage: UsageState[]; entitlement: Entitlement | null; graceEndsAt?: string | null; graceExpired?: boolean }) {
  const worst = bannerMeter(usage);
  const pastDue = entitlement?.status === "past_due";
  if (!worst && !pastDue) return null;
  const link = (label: string) => (
    <Link href="/app/billing" className="button-sm inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-text transition-colors duration-300 hover:border-text focus-visible:focus-ring">
      {label}
    </Link>
  );
  return (
    <div className="flex flex-col gap-2">
      {pastDue ? (
        <Notice tone="warning" title="Your last payment failed" action={link("Update payment")}>
          Your plan stays active for {product.graceDays} days while we retry. Update your payment method to avoid falling back to Free.
        </Notice>
      ) : null}
      {worst ? (
        <Notice
          tone={worst.used > worst.limit ? "danger" : "warning"}
          title={worst.used > worst.limit ? "You are over your limit" : worst.level === "over" ? "You have reached your limit" : "You are close to your limit"}
          action={link("Upgrade")}
        >
          You have used {fmt(worst.used)} of {fmt(worst.limit)} {METER_LABELS[worst.meter].plural}
          {METER_LABELS[worst.meter].period ? ` ${METER_LABELS[worst.meter].period}` : ""}.
          {worst.meter === "devices" && worst.used > worst.limit ? (graceExpired ? " The 14 day grace period has ended, so publishing is paused until you upgrade." : graceEndsAt ? ` You can keep publishing until ${new Date(graceEndsAt).toISOString().slice(0, 10)} (14 day grace period).` : "") : ""}
        </Notice>
      ) : null}
    </div>
  );
}
