import { getDb, type Db } from "@/lib/db";
import { appUrl, entraConfigured } from "@/lib/env";
import { getGraphFactory, type GraphFactory } from "@/lib/graph";
import { sendMail } from "@/lib/mail";
import type { MailMessage } from "@/lib/mail/types";

/** Everything the domain code needs from the outside world, so tests can pass fakes (no network). */
export interface Deps {
  db: Db;
  graph: GraphFactory;
  sendMail: (m: MailMessage) => Promise<unknown>;
  baseUrl: string;
  now: () => Date;
  /** Consent proof (REVIEW P1-1): binding a Microsoft tenant needs an admin sign-in. Off only in stub mode (no Entra app) and in old tests. */
  requireConsentProof?: boolean;
  fetch?: typeof fetch;
}

export async function defaultDeps(): Promise<Deps> {
  return { db: await getDb(), graph: getGraphFactory(), sendMail: (m) => sendMail(m), baseUrl: appUrl(), now: () => new Date(), requireConsentProof: entraConfigured() };
}
