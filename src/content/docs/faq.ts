import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const faq: DocPage = {
  slug: "faq",
  title: "FAQ",
  description: `Short answers about ${p.name}: what is proven, what is pending and how the product behaves.`,
  sections: [
    {
      heading: "Has it been proven on a real Intune tenant?",
      body: ["Not yet. The Intune upload path is built against Microsoft's documented Graph API and tested with a fake Graph. The first upload to a real tenant is a pending step, and we will say so on the security page until it is done."],
    },
    {
      heading: "Is the catalog real?",
      body: ["The public catalog currently shows demo data: seeded apps with illustrative versions and hashes, labelled as such. The live winget sync, downloader and scanner run once the pipeline is switched on."],
    },
    {
      heading: "Is the VM test running?",
      body: ["No. The Windows test lab is not attached yet, so the VM check shows as pending and those versions publish to Pilot only."],
    },
    {
      heading: "Where do alerts go?",
      body: ["Ring paused, tenant disconnected, signer changed, consent revoked and device limit grace ending go to the in-app alert centre (the bell) and by email. Each member sets email, digest and muted tenants under Settings, Notifications. Critical alerts always show in the app."],
    },
    {
      heading: "Can I trust the audit log?",
      body: ["It is append only and each entry carries the hash of the previous one. Owners and admins can run Verify chain on the audit log page. It detects edits, removals and reordering, but not the removal of the newest entries."],
    },
    {
      heading: "What does it cost?",
      body: ["See Pricing and Billing. The Free plan has no card and covers 25 devices and 1 tenant."],
    },
  ],
};
