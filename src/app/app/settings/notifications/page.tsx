import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/auth/session";
import { NotificationsClient } from "./notifications-client";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireOrg({ page: true });
  return (
    <>
      <PageHeader title="Notifications" description="Where critical events reach you: the alert centre in the app and email. These settings are yours alone, for this organization." />
      <NotificationsClient />
    </>
  );
}
