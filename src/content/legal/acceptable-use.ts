import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const acceptableUse: LegalDoc = {
  slug: "acceptable-use",
  title: "Acceptable use policy",
  description: `What you may and may not do with ${p.name}.`,
  sections: [
    {
      id: "purpose",
      title: "Purpose",
      body: [`This policy keeps ${p.name} safe and reliable for everyone. It is part of the terms of service.`],
    },
    {
      id: "prohibited",
      title: "You must not",
      body: [
        {
          list: [
            "Break the law or help others do so.",
            "Use the service against any Microsoft Entra tenant or Intune environment you are not authorised to administer. Customers and MSPs must hold a valid delegated or direct admin relationship with each tenant they connect.",
            "Upload malware, or any installer or script that is designed to damage devices, steal data or evade security tools.",
            "Package or publish software you have no right to distribute, or use Custom Apps to infringe intellectual property.",
            "Share API keys or webhook secrets with people who are not on your team, or use them to act for someone else without permission.",
            "Probe, scan or attack the service, or bypass rate limits, plan limits or device counts.",
            "Resell the service as your own without written permission.",
            "Use the service to harass others or to break the Microsoft terms that apply to your tenant.",
          ],
        },
      ],
    },
    {
      id: "enforcement",
      title: "Enforcement",
      body: [
        "We may block uploads, pause publishing, suspend tenant connections or close accounts that break this policy. Where we can, we warn you first and give you time to fix the problem. For serious abuse we act immediately.",
      ],
    },
    {
      id: "report",
      title: "Report abuse",
      body: [`Email ${p.supportEmail} with the account or tenant concerned and what you saw.`],
    },
  ],
};
