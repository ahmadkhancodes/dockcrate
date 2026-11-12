import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { DataTable, Td } from "@/components/app/data-table";
import { formatDate } from "@/components/app/format";
import { PageHeader } from "@/components/app/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/states";
import { can } from "@/lib/auth/roles";
import { getMembership } from "@/lib/auth/scope";
import { requireOrg } from "@/lib/auth/session";
import { auditVisible } from "@/lib/authz";
import { collectAudit, parseAuditFilter } from "@/lib/audit-export";
import { getDb } from "@/lib/db";
import { VerifyChainButton } from "./verify-button";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireOrg({ page: true });
  if (!can(ctx.role, "audit", "read")) {
    return (
      <>
        <PageHeader title="Audit log" />
        <Notice title="Owners and admins only">The audit log records who changed what. Ask an owner or admin if you need to see it.</Notice>
      </>
    );
  }
  const filter = parseAuditFilter(sp);
  const raw = one(sp.before);
  const parsed = raw ? new Date(raw) : null;
  const before = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
  const filtered = !!(filter.action || filter.actor || filter.from || filter.to);
  const to = before && (!filter.to || before < filter.to) ? before : filter.to;
  const db = await getDb();
  const m = await getMembership(db, ctx.org.id, ctx.user.id, ctx.role);
  const rows = (await collectAudit((o) => db.listAudit(ctx.org.id, o), { ...filter, to }, PAGE + 1)).filter((e) => auditVisible(m, e));
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const last = shown[shown.length - 1];
  const q = new URLSearchParams();
  for (const k of ["action", "actor", "from", "to"] as const) { const v = one(sp[k]); if (v) q.set(k, v); }
  const withQuery = (extra: Record<string, string> = {}) => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(extra)) n.set(k, v); const s = n.toString(); return s ? `?${s}` : ""; };
  return (
    <>
      <PageHeader
        title="Audit log"
        description="An append-only record of every user and system action in this organization, newest first. Entries cannot be edited or deleted, and each one is chained to the one before it so tampering shows up."
        actions={<a href={`/api/audit${withQuery({ format: "csv" })}`} className={buttonClass("secondary")} download><DownloadSimple size={16} aria-hidden /> Export CSV</a>}
      />
      {can(ctx.role, "apiKey", "manage") ? <VerifyChainButton /> : null}
      <form method="get" className="mb-6 grid gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Field label="Action" htmlFor="f-action" hint="Exact, or a prefix like tenant."><Input id="f-action" name="action" defaultValue={one(sp.action) ?? ""} placeholder="deployment." autoComplete="off" /></Field>
        <Field label="Actor" htmlFor="f-actor" hint="User id, or system"><Input id="f-actor" name="actor" defaultValue={one(sp.actor) ?? ""} autoComplete="off" /></Field>
        <Field label="From" htmlFor="f-from"><Input id="f-from" name="from" type="date" defaultValue={one(sp.from) ?? ""} /></Field>
        <Field label="To" htmlFor="f-to"><Input id="f-to" name="to" type="date" defaultValue={one(sp.to) ?? ""} /></Field>
        <div className="flex gap-2"><Button type="submit">Filter</Button>{filtered ? <Link href="/app/settings/audit" className={buttonClass("secondary")}>Clear</Link> : null}</div>
      </form>
      {shown.length === 0 ? (
        <EmptyState
          title={before ? "Nothing older than this" : filtered ? "No entries match these filters" : "No activity recorded yet"}
          body={before ? "You have reached the start of the log." : filtered ? "Widen the date range or clear a filter." : "Sign-ins, tenant connections, publishes, rollbacks, role changes and billing events show up here as they happen."}
          action={before || filtered ? <Link href={before ? `/app/settings/audit${withQuery()}` : "/app/settings/audit"} className={buttonClass("secondary")}>{before ? "Back to newest" : "Clear filters"}</Link> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable
            maxHeight
            caption="Audit log"
            columns={[
              { key: "at", label: "Time" },
              { key: "actor", label: "Actor" },
              { key: "action", label: "Action" },
              { key: "target", label: "Target" },
              { key: "ip", label: "IP" },
            ]}
          >
            {shown.map((r) => (
              <tr key={r.id}>
                <Td muted><time dateTime={r.at.toISOString()}>{formatDate(r.at, true)}</time></Td>
                <Td muted className="break-all">{r.actorId ?? "System"}</Td>
                <Td><code>{r.action}</code></Td>
                <Td muted className="break-all">{r.target ?? "None"}</Td>
                <Td muted>{r.ip ?? "None"}</Td>
              </tr>
            ))}
          </DataTable>
          <div className="flex gap-2">
            {before ? <Link href={`/app/settings/audit${withQuery()}`} className={buttonClass("secondary")}>Newest</Link> : null}
            {more && last ? <Link href={`/app/settings/audit${withQuery({ before: last.at.toISOString() })}`} className={buttonClass("secondary")}>Older</Link> : null}
          </div>
        </div>
      )}
    </>
  );
}
