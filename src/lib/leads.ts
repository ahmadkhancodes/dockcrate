import { z } from "zod";
import { product } from "@/config/product";
import { csvCell } from "@/lib/audit-export";
import type { Deps } from "@/lib/deps";
import { HttpError } from "@/lib/http";
import { noticeEmail } from "@/lib/mail/templates";
import { isDisposableEmail, normEmail } from "@/lib/security/disposable";

/** Early-access requests. Stored through the Db collection interface under `leads` (Mongo indexes in createAllIndexes). */
export interface Lead {
  id: string;
  email: string;
  company: string;
  endpoints: number;
  note: string;
  createdAt: Date;
}

export const LEADS = "leads";

export const leadInput = z.object({
  email: z.string().trim().min(3).max(254),
  company: z.string().trim().min(1).max(120),
  endpoints: z.coerce.number().int().min(1).max(10_000_000),
  note: z.string().trim().max(1000).optional().default(""),
  altcha: z.unknown().optional(),
  /** Honeypot: real people never fill this. */
  website: z.string().max(200).optional(),
});
export type LeadInput = z.infer<typeof leadInput>;

/** Stores the lead (one per email; a repeat updates it), mails the visitor a confirmation and the founders a notice. */
export async function saveLead(deps: Deps, input: LeadInput): Promise<{ lead: Lead; isNew: boolean }> {
  const email = normEmail(input.email);
  if (!email) throw new HttpError(400, "invalid_email");
  if (isDisposableEmail(email)) throw new HttpError(400, "disposable_email");
  const col = deps.db.collection<Lead>(LEADS);
  const id = `lead_${email}`;
  const existing = await col.get(id);
  const lead: Lead = { id, email, company: input.company, endpoints: input.endpoints, note: input.note ?? "", createdAt: existing?.createdAt ?? deps.now() };
  await col.put(lead);
  if (!existing) {
    const confirm = noticeEmail({
      title: `You are on the ${product.name} early access list`,
      body: `Thanks, ${lead.company}. We will write to this address when publishing into your own Intune tenant opens. Until then the public catalog, the packer and the rings model are open to everyone.`,
      actionUrl: `${deps.baseUrl}/catalog`,
      actionLabel: "Browse the catalog",
    });
    const notify = noticeEmail({
      title: `Early access request: ${lead.company}`,
      body: `${lead.email} manages ${lead.endpoints} Windows endpoints.${lead.note ? ` Note: ${lead.note}` : ""}`,
    });
    // Mail failures must not lose the lead.
    await Promise.allSettled([
      deps.sendMail({ to: lead.email, ...confirm, category: "transactional", replyTo: product.supportEmail }),
      deps.sendMail({ to: product.supportEmail, ...notify, category: "transactional", replyTo: lead.email }),
    ]);
  }
  return { lead, isNew: !existing };
}

export async function listLeads(deps: Pick<Deps, "db">): Promise<Lead[]> {
  return (await deps.db.collection<Lead>(LEADS).find()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function leadsCsv(leads: Lead[]): string {
  const head = ["created_utc", "email", "company", "windows_endpoints", "note"];
  const rows = leads.map((l) => [l.createdAt.toISOString(), l.email, l.company, l.endpoints, l.note]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
