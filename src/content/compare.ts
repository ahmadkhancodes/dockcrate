import { planById } from "@/config/product";
import type { CompareValue } from "@/components/marketing/compare-table";

export const CHECKED = "Nov 3, 2026";

export interface CompareEntry {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  source: { label: string; href: string };
  columns: [string, string];
  rows: { label: string; values: [CompareValue, CompareValue] }[];
  /** Where the competitor is the better pick. Honest, from the brief. */
  better: string[];
  faq: { q: string; a: string }[];
}

const price = (id: string, interval: "month" | "year") => {
  const cents = planById(id)?.prices.find((p) => p.interval === interval)?.usd ?? 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
};
const edu = `$${(planById("professional")?.educationUsd ?? 0) / 100}`;

/** Compare page data: add an entry and /compare/<slug> exists. Facts, price, source and check date only. */
export const comparisons: CompareEntry[] = [
  {
    slug: "pckgr",
    competitor: "Pckgr",
    title: "DockCrate by BufferSol vs Pckgr",
    description: `Pckgr and DockCrate by BufferSol compared on price, tenants and plans, checked ${CHECKED}. Includes where Pckgr is the better pick.`,
    headline: "DockCrate by BufferSol vs Pckgr",
    intro: `Both package third party apps for Intune. Pckgr is the established leader, and this page shows where each one fits. Pckgr prices checked ${CHECKED}.`,
    source: { label: "pckgr.com/pricing", href: "https://www.pckgr.com/pricing" },
    columns: ["Pckgr", "DockCrate by BufferSol"],
    rows: [
      { label: "Entry paid plan, per month", values: ["Starter $49", `Starter ${price("starter", "month")}`] },
      { label: "Entry paid plan, per year", values: ["$499", price("starter", "year")] },
      { label: "Tenants on the entry paid plan", values: ["1 (single tenant)", "5"] },
      { label: "Devices on the entry paid plan", values: ["100", "100"] },
      { label: "Middle plan, per month", values: ["Professional $99, 1,000 devices", `Professional ${price("professional", "month")}, 1,000 devices`] },
      { label: "Top listed plan, per month", values: ["Business $149, 2,500 devices", `Business ${price("business", "month")}, 2,500 devices`] },
      { label: "Free plan", values: ["No, 30 day trial", "Yes, 25 devices, 1 tenant"] },
      { label: "Discount for education and non profit", values: ["None listed", `${edu}/mo with proof of status`] },
    ],
    better: [
      "Flat device tiers that work out cheap per device at the top of the range.",
      "A private tested repository and an established catalog.",
      "macOS through Installomator today. For DockCrate by BufferSol it is on the roadmap.",
      "Policy Manager (beta) and a Defender Security Dashboard, which we do not have yet.",
      "A longer track record: by its own count over 1,000 customers in 60 countries.",
    ],
    faq: [
      { q: "Is DockCrate by BufferSol cheaper than Pckgr?", a: `At the entry tier, ${price("starter", "month")} a month against Pckgr Starter at $49 a month (pckgr.com, checked ${CHECKED}), and our entry tier covers 5 tenants rather than 1.` },
      { q: "Does Pckgr have a free plan?", a: `Pckgr lists a 30 day trial with no card and no free tier (pckgr.com, checked ${CHECKED}). DockCrate by BufferSol has a free plan for 25 devices and 1 tenant.` },
      { q: "When should I choose Pckgr?", a: "When you need macOS today, Policy Manager or a Defender dashboard, or you want a vendor with a longer history. The list above is everything we know of." },
    ],
  },
];

export const comparisonBySlug = (slug: string) => comparisons.find((c) => c.slug === slug);
export const compareEntries = comparisons;
