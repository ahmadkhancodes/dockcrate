import { DataTable, Td } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { defaultDeps } from "@/lib/deps";
import { listLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const leads = await listLeads(await defaultDeps());
  return (
    <>
      <PageHeader title="Early-access leads" description="Newest first. Visible to founder accounts only." actions={<ButtonLink href="/api/admin/leads" variant="secondary">Export CSV</ButtonLink>} />
      {leads.length === 0 ? (
        <EmptyState title="No leads yet" body="Requests from the early-access form appear here." />
      ) : (
        <DataTable caption="Early-access leads" columns={[{ key: "at", label: "Received" }, { key: "email", label: "Work email" }, { key: "company", label: "Company" }, { key: "n", label: "Endpoints", align: "right" }, { key: "note", label: "Note" }]}>
          {leads.map((l) => (
            <tr key={l.id}>
              <Td muted>{l.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</Td>
              <Td>{l.email}</Td>
              <Td>{l.company}</Td>
              <Td align="right">{l.endpoints.toLocaleString("en-US")}</Td>
              <Td muted>{l.note}</Td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
