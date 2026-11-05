import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { UsageBanner } from "@/components/app/usage-banner";
import { product } from "@/config/product";
import { isFounderAdmin, requireOrg } from "@/lib/auth/session";
import { limitStates, orgLimits } from "@/lib/billing/limits";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const [ent, limits] = await Promise.all([db.getEntitlement(ctx.org.id), orgLimits(db, ctx.org.id)]);
  return (
    <AppShell
      org={{ id: ctx.org.id, name: ctx.org.name }}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      isAdmin={isFounderAdmin(ctx.user.email)}
      productName={product.name}
      banners={<UsageBanner usage={limitStates(limits)} entitlement={ent} graceEndsAt={limits.graceEndsAt} graceExpired={limits.graceExpired} />}
    >
      {children}
    </AppShell>
  );
}
