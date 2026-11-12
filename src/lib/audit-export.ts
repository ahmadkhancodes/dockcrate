import type { AuditEntry } from "@/lib/db/types";

export interface AuditFilter {
  /** Exact action or a prefix ending in "." (e.g. "tenant." matches tenant.created). */
  action?: string;
  /** Actor id; "system" matches entries without an actor. */
  actor?: string;
  from?: Date;
  /** Exclusive upper bound. */
  to?: Date;
}

export function parseAuditFilter(sp: URLSearchParams | Record<string, string | string[] | undefined>): AuditFilter {
  const get = (k: string) => { const v = sp instanceof URLSearchParams ? sp.get(k) : Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined); return v?.trim() || undefined; };
  const date = (v?: string, endOfDay = false) => {
    if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined;
    const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
    if (Number.isNaN(d.getTime())) return undefined;
    return endOfDay && v.length === 10 ? new Date(d.getTime() + 86_400_000) : d;
  };
  return { action: get("action"), actor: get("actor"), from: date(get("from")), to: date(get("to"), true) };
}

export function filterAudit(entries: AuditEntry[], f: AuditFilter): AuditEntry[] {
  return entries.filter((e) => {
    if (f.action && !(f.action.endsWith(".") ? e.action.startsWith(f.action) : e.action === f.action)) return false;
    if (f.actor && (f.actor.toLowerCase() === "system" ? e.actorId !== null : e.actorId !== f.actor)) return false;
    if (f.from && e.at < f.from) return false;
    if (f.to && e.at >= f.to) return false;
    return true;
  });
}

/** RFC 4180 quoting, plus a leading apostrophe on cells a spreadsheet would run as a formula. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Also leading blanks before a formula character, full width variants and "|" (DDE), which some spreadsheets still run (S-7).
  if (/^[\s\u00a0\u3000]*[=+\-@|%\uff1d\uff0b\uff0d\uff20]/.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const AUDIT_CSV_HEADER = ["time_utc", "actor", "action", "target", "ip", "details"] as const;

/** Every entry as a row: time (UTC ISO), actor (id or "system"), action, target, IP, details (JSON). */
export function auditCsv(entries: AuditEntry[]): string {
  const rows = entries.map((e) => [e.at.toISOString(), e.actorId ?? "system", e.action, e.target ?? "", e.ip ?? "", e.meta && Object.keys(e.meta).length ? JSON.stringify(e.meta) : ""]);
  return [AUDIT_CSV_HEADER as readonly string[], ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Pages through the whole log (newest first), up to `max` entries, applying the filter. */
export async function collectAudit(list: (opts: { limit: number; before?: Date }) => Promise<AuditEntry[]>, f: AuditFilter, max = 20_000): Promise<AuditEntry[]> {
  const out: AuditEntry[] = [];
  let before: Date | undefined = f.to;
  while (out.length < max) {
    const page = await list({ limit: 500, before });
    if (page.length === 0) break;
    out.push(...filterAudit(page, f));
    before = page[page.length - 1]!.at;
    if (page.length < 500) break;
  }
  return out.slice(0, max);
}
