import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { apiCtx } from "@/lib/api/ctx";
import { canAccess, inScope } from "@/lib/authz";
import type { RingConfig } from "@/lib/rings/types";
import type { Tenant } from "@/lib/tenants";
import { RingsClient } from "./rings-client";

export const metadata = { title: "Ring setup" };
export const dynamic = "force-dynamic";

export default async function RingsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { org, membership, deps } = await apiCtx({ page: true });
  const tenant = await deps.db.collection<Tenant>("tenants").get(tenantId);
  if (!tenant || tenant.orgId !== org.org.id || !inScope(membership, tenant.id)) notFound();
  const config = await deps.db.collection<RingConfig>("ring_configs").get(tenant.id);
  return (
    <>
      <PageHeader title="Ring setup" description={`${tenant.name}: choose who gets an update first, who gets it later, and when a ring pauses itself.`} actions={<Link href={`/app?tenant=${tenant.id}`} className={buttonClass("secondary")}>Back to the dock</Link>} />
      {tenant.status !== "connected" ? (
        <Notice tone="warning" title="Tenant not connected" action={<Link href={`/app/tenants?tenant=${tenant.id}`} className={buttonClass("secondary")}>Open connection</Link>}>Rings read this tenant&apos;s groups, so it has to be connected first.</Notice>
      ) : (
        <RingsClient tenantId={tenant.id} canConfigure={canAccess(membership, "ring", "configure", tenant.id)} initial={config} />
      )}
    </>
  );
}
