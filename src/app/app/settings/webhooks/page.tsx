import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { WebhooksClient } from "./webhooks-client";

export const metadata = { title: "Webhooks" };

/** Event names offered in the create form. A product adds its own events here. */
const EVENTS = ["*", ...WEBHOOK_EVENTS];

export default async function WebhooksPage() {
  const ctx = await requireOrg({ page: true });
  return (
    <>
      <PageHeader title="Webhooks" description="We POST signed JSON to your URL when something happens. Failed deliveries retry with backoff, and every attempt is logged below." />
      <WebhooksClient canManage={can(ctx.role, "webhook", "manage")} events={EVENTS} />
    </>
  );
}
