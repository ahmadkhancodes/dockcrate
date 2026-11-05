import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const authentication: DocPage = {
  slug: "authentication",
  title: "Sign in and permissions",
  description: `How you sign in to ${p.name}, the 3 Microsoft Graph permissions it asks for, and API keys.`,
  sections: [
    {
      heading: "Sign in",
      body: [
        `${p.fullName} signs you in with a Microsoft work account through Entra. Personal Microsoft accounts are not accepted. Sign in with Microsoft is the intended primary method and is on the roadmap where it is not yet enabled on your account.`,
        "Until then you can sign in with an email magic link. The link works once and expires after 10 minutes. You can also add a passkey or an authenticator app for two factor under Settings, then Security.",
      ],
    },
    {
      heading: "The 3 Graph permissions",
      body: [
        "Connecting a tenant asks for 3 application permissions. Here is what each one allows, and what it does not.",
        "DeviceManagementApps.ReadWrite.All: create and update Win32 apps and their assignments in Intune, and read install status. It does not allow changes to device configuration, compliance or policies.",
        "DeviceManagementManagedDevices.Read.All: read managed devices so we can count them for the device meter. It is read only. It does not allow wipe, retire or any other device action.",
        "Group.Read.All: read Entra groups so you can pick your Pilot and Broad groups. It does not allow creating, changing or deleting groups or members.",
      ],
    },
    {
      heading: "Roles",
      body: [
        "Each organization has owner, admin, member and viewer roles. Owners manage billing. Owners and admins manage API keys and webhooks and read the audit log. Members can read them. Viewers have read access to data only.",
      ],
    },
    {
      heading: "API keys",
      body: [
        "Server to server requests use API keys. Create and revoke them in Settings, then API keys. Send the key in the x-api-key header. The full key is shown once. Never put a key in browser code or a public repository. If a key leaks, revoke it and create a new one.",
      ],
      code: {
        lang: "bash",
        code: `curl ${p.url}/api/v1/me \\\n  -H "x-api-key: YOUR_API_KEY"`,
      },
    },
  ],
};
