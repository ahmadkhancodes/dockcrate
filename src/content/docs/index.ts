import { api } from "./api";
import { authentication } from "./authentication";
import { appSets } from "./app-sets";
import { billing } from "./billing";
import { connectATenant } from "./connect-a-tenant";
import { faq } from "./faq";
import { gettingStarted } from "./getting-started";
import { howChecked } from "./how-a-version-is-checked";
import { rings } from "./rings";
import { rollback } from "./rollback";
import type { DocPage } from "./types";
import { webhooks } from "./webhooks";

export type { DocPage, DocSection } from "./types";

export interface DocGroup {
  title: string;
  docs: DocPage[];
}

export const docs: DocPage[] = [gettingStarted, connectATenant, rings, rollback, appSets, authentication, howChecked, billing, faq, webhooks, api];

export const docGroups: DocGroup[] = [
  { title: "Start here", docs: [gettingStarted, connectATenant, authentication, howChecked] },
  { title: "Ship apps", docs: [rings, rollback, appSets] },
  { title: "Build", docs: [api, webhooks] },
  { title: "Account", docs: [billing, faq] },
];

export const getDoc = (slug: string): DocPage | undefined => docs.find((d) => d.slug === slug);

export const sectionId = (heading: string): string =>
  heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
