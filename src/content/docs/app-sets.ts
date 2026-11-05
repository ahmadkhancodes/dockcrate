import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const appSets: DocPage = {
  slug: "app-sets",
  title: "App Sets",
  description: `Publish a named list of apps to many tenants at once with ${p.name} App Sets.`,
  sections: [
    {
      heading: "What an App Set is",
      body: ["A named list of up to 50 catalog apps with defaults for intent and auto update. Run it against any number of connected tenants (up to 100 per run) to publish every app in each tenant's rings. App Sets are on Professional and Business."],
    },
    {
      heading: "Running one",
      body: [
        "We process 3 tenants at a time. The progress view shows each tenant and each app. A tenant that is disconnected, paused, over its device grace or without rings set up fails on its own and does not stop the others.",
        "Retry failed re-runs only the tenants that failed. Apps already published are skipped, so a retry never duplicates.",
      ],
    },
    {
      heading: "Scope",
      body: ["A technician can run a set only against tenants in their scope. The MSP view shows what is out of date, paused or disconnected across the same tenants."],
    },
  ],
};
