import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const security: LegalDoc = {
  slug: "security",
  title: "Security",
  description: `How ${p.name} protects your account and your Intune tenants.`,
  sections: [
    {
      id: "overview",
      title: "Overview",
      body: [`We design ${p.name} so that a mistake in one place does not expose everything. This page lists what we do today, and nothing we do not do.`],
    },
    {
      id: "data-protection",
      title: "Data protection",
      body: [
        {
          list: [
            "All traffic uses TLS.",
            "Data is encrypted at rest by our database and hosting providers.",
            "API keys and webhook secrets are shown once. API keys are stored as hashes.",
            "We never store customer secrets. Access to your tenant uses admin consent for our app registration, limited to three Microsoft Graph application permissions: DeviceManagementApps.ReadWrite.All, DeviceManagementManagedDevices.Read.All and Group.Read.All. You can revoke consent in Entra at any time.",
            "Every query is scoped to your organization.",
          ],
        },
      ],
    },
    {
      id: "access",
      title: "Access control",
      body: [
        {
          list: [
            "Sign in with a Microsoft Entra work or school account. Personal Microsoft accounts are rejected. Multifactor rules are those of your own Entra tenant.",
            "Roles limit what each team member can change.",
            "Staff access to production data is limited, logged and used only for support you request or to fix incidents.",
          ],
        },
      ],
    },
    {
      id: "application",
      title: "Application security",
      body: [
        {
          list: [
            "Rate limiting on public endpoints and on the API.",
            "Every app version is hash checked, signer checked, malware scanned and test installed before publishing.",
            "An audit log records changes in your workspace.",
            "Outbound webhooks are signed so you can verify them.",
            "Dependencies are updated regularly and checked for known vulnerabilities.",
          ],
        },
      ],
    },
    {
      id: "infrastructure",
      title: "Infrastructure",
      body: ["We run on the providers listed on the subprocessors page. We rely on their physical and network security controls."],
    },
    {
      id: "certifications",
      title: "Certifications",
      body: ["SOC 2 Type 1 is on our roadmap."],
    },
    {
      id: "incidents",
      title: "Incident response",
      body: ["If a breach affects your data we will tell you without undue delay and share what happened, what data was involved and what we are doing about it."],
    },
    {
      id: "reporting",
      title: "Report a vulnerability",
      body: [`Email ${p.legalEmail} with the details and steps to reproduce. Please give us reasonable time to fix the issue before you disclose it. We will not take legal action against honest research.`],
    },
  ],
};
