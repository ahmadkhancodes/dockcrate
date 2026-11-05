import { product as p } from "@/config/product";
import type { DocPage } from "./types";

const money = (usd: number) => `$${(usd / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const billing: DocPage = {
  slug: "billing",
  title: "Billing",
  description: `Plans, the device meter, grace period and the customer portal for ${p.fullName}.`,
  sections: [
    {
      heading: "Plans",
      body: p.plans.map((pl) => {
        const prices = pl.prices.length
          ? pl.prices.map((x) => `${money(x.usd)} per ${x.interval}`).join(" or ")
          : "free";
        return `${pl.name} (${prices}): ${pl.highlights.join(", ")}.`;
      }),
    },
    {
      heading: "Device meter",
      body: [
        `${p.fullName} bills on managed devices. Devices are counted nightly from Intune. Devices with no check in for 90 days are not counted. Each plan lists its device limit above, and a banner shows your count against the limit, for example 108 of 100.`,
        "Going over the limit does not stop anything for 14 days. Upgrade within that window to stay on the same footing.",
      ],
    },
    {
      heading: "Education and non-profit",
      body: [`Education and non-profit organizations pay ${money(p.plans.find((x) => x.id === "professional")?.educationUsd ?? 0)} per month for Professional, with proof of status.`],
    },
    {
      heading: "Checkout",
      body: [
        "Choose a plan in Settings, then Billing. You are sent to a Stripe Checkout page to pay. When payment succeeds you return to the app and your plan updates within seconds.",
      ],
    },
    {
      heading: "Customer portal",
      body: [
        "Use the portal to change plan, update your card, download invoices and cancel anytime. Open it from Settings, then Billing, then Manage billing. A cancelled plan stays active until the end of the period you paid for.",
      ],
    },
    {
      heading: "Failed payments",
      body: [
        `If a card payment fails, your plan stays active for ${p.graceDays} days while Stripe retries. After that the account falls back to the Free plan limits. Your data is kept.`,
      ],
    },
    {
      heading: "Billing webhooks",
      body: [
        `Billing state is synced from Stripe through a webhook at ${p.url}/api/stripe/webhook. The endpoint verifies the Stripe signature and is idempotent, so retries are safe. You do not need to configure anything as a customer.`,
      ],
    },
  ],
};
