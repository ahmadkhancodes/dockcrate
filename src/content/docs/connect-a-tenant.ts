import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const connectATenant: DocPage = {
  slug: "connect-a-tenant",
  title: "Connect a tenant",
  description: `Give ${p.name} access to one Intune tenant, send the consent link to an admin, and fix a disconnected tenant.`,
  sections: [
    {
      heading: "What you are approving",
      body: [
        "Three Microsoft Graph application permissions, granted once by a Global Administrator in the customer's own tenant: DeviceManagementApps.ReadWrite.All (create and assign the Win32 apps we publish), DeviceManagementManagedDevices.Read.All (count devices and read install results) and Group.Read.All (list groups for the ring pickers). The security page lists what each one does and does not allow.",
      ],
    },
    {
      heading: "Connect",
      body: [
        "Open Tenants, choose Connect a tenant and name it. If you are a Global Admin, approve the consent screen. The tenant shows Connected within about a minute, after we run a test call against it.",
        "If you are not a Global Admin, choose Send consent link and enter the admin's email. The link works for 7 days. The tenant shows Waiting for admin until it is approved.",
        "Until Microsoft Partner Center publisher verification completes, the consent screen shows the app as unverified. That is expected and listed on the security page.",
      ],
    },
    {
      heading: "Limits",
      body: ["Each plan has a tenant limit (Free: 1, Starter: 5, Professional and Business: unlimited). Adding a tenant over the limit opens an upgrade dialog instead of failing quietly."],
    },
    {
      heading: "Disconnected tenants",
      body: [
        "If consent is removed in Entra, or Microsoft rejects our credential, the tenant shows Disconnected. Jobs for that tenant stop, the dock shows a banner, and an alert goes to the alert centre and by email. Send a new consent link or approve again to reconnect.",
      ],
    },
    {
      heading: "Who can connect",
      body: ["Owners and admins can connect tenants. Operators and viewers see only the tenants their scope allows; an owner or admin sets that under Settings, Members, Tenant access."],
    },
  ],
};
