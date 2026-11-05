import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const rollback: DocPage = {
  slug: "rollback",
  title: "Rollback",
  description: `One-click rollback to an earlier version of an app in ${p.name}.`,
  sections: [
    {
      heading: "What rollback does",
      body: [
        "Roll back from the dock on any published, promoted or paused deployment. The earlier version is assigned again with the intent the ring used (Required unless the ring was Available), and the newer version is assigned Uninstall for the rings it had reached.",
        "By default it goes to the previous version. You can choose any of the last 3 earlier versions of that app in that tenant.",
      ],
    },
    {
      heading: "Records",
      body: ["Every rollback is written to the audit log with the tenant, app and both versions. Operators, admins and owners can roll back; viewers cannot."],
    },
    {
      heading: "When it is not available",
      body: ["No earlier version deployed through DockCrate in that tenant, a tenant that is not connected, or a deployment that never finished publishing. The dialog says which."],
    },
  ],
};
