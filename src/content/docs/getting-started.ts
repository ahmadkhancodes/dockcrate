import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const gettingStarted: DocPage = {
  slug: "getting-started",
  title: "Getting started",
  description: `Connect an Intune tenant to ${p.name}, set up Pilot and Broad groups and publish your first app.`,
  sections: [
    {
      heading: "Current status",
      body: ["Available today: the public catalog with inspection tags and QA logs, the .intunewin packer and the rings model. Coming with early access: publishing into your own Intune tenant. The catalog is labelled as demo data until the live pipeline runs, and the VM check is pending until the Windows lab is attached. The FAQ lists what is and is not live."],
    },
    {
      heading: "Before you start",
      body: [
        `${p.fullName} publishes third-party apps to your own Intune tenant as Win32 apps. You need a Microsoft work account to sign in and a Global Admin to approve the connection once. New accounts start on the ${p.plans[0]?.name ?? "Free"} plan: 25 devices, 1 tenant and 15 catalog apps, with rings and rollback included.`,
      ],
    },
    {
      heading: "Connect a tenant",
      body: [
        "Choose Connect a tenant in the app. If you are a Global Admin, approving the 3 requested permissions takes one click and the tenant shows as Connected within 60 seconds.",
        "If you are not a Global Admin, use Send consent link to admin. We email the link, and the tenant shows Waiting for admin until it is approved. If consent is later removed, the tenant shows Disconnected and the owner is emailed.",
      ],
    },
    {
      heading: "Pick your Pilot and Broad groups",
      body: [
        "Rings are two Entra groups. Pilot receives each new version first. Broad receives it after a delay. Choose existing groups, or let us create DC-Pilot and DC-Broad for you.",
        "Defaults are 0 hours for Pilot and 48 hours for Broad. A version reaches Broad only if Pilot failures stay under the threshold, which defaults to 10%. Otherwise Broad is paused at the next daily check and you get an alert.",
      ],
    },
    {
      heading: "Publish an app",
      body: [
        "Search the catalog, pick an app and choose Publish. The version is checked first (see How a version is checked), then created in your tenant as a Win32 app with detection rules and your Pilot and Broad assignments. App names carry the prefix DC | so they are easy to find in Intune.",
        "Turn on auto update per app and per tenant to move later versions through Pilot and Broad automatically.",
      ],
    },
    {
      heading: "Roll back",
      body: [
        "Each app keeps its last 3 versions. Roll back re-assigns the earlier version as Required and sets the newer one to Uninstall for the affected ring. Every rollback is written to the audit log.",
      ],
    },
    {
      heading: "Next steps",
      body: [
        "Read Sign in and permissions for what each Graph permission allows. Read Billing for plans and the device meter. Webhooks and the API are for sending events and reading data in your own systems.",
      ],
    },
  ],
};
