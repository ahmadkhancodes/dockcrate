import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const rings: DocPage = {
  slug: "rings",
  title: "Rings",
  description: `How Pilot and Broad rings, the failure threshold and auto-pause work in ${p.name}.`,
  sections: [
    {
      heading: "Two rings",
      body: [
        "Each tenant has a Pilot group and a Broad group, both Entra groups you pick (we never change group membership). A new version goes to Pilot first. Broad receives it after the Broad delay.",
        "Defaults: Pilot 0 hours, Broad 48 hours, failure threshold 10%, intent Required. All are editable per tenant under Rings.",
      ],
    },
    {
      heading: "Auto-pause",
      body: [
        "Every minute we read install results for Pilot devices. If the failure rate reaches the threshold, the deployment is paused: Broad is not assigned, an alert is raised on both channels and an audit entry is written. You can roll back or review the log from the dock.",
        "A version also reaches Broad only when it has passed all four checks, including the VM test. Until the Windows lab is running, versions publish to Pilot only.",
      ],
    },
    {
      heading: "Pause controls",
      body: ["You can pause one tenant or the whole organization. Paused scopes publish nothing and promote nothing until resumed."],
    },
    {
      heading: "Auto update",
      body: ["Turn on auto update per app and per tenant. When a newer version becomes publishable, it is published to Pilot and follows the rings. A new version without a reviewed detection rule waits for review and never auto publishes."],
    },
  ],
};
