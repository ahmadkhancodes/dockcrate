import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { earlyAccessOpen } from "@/lib/early-access";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader earlyAccess={earlyAccessOpen()} />
      <main id="main" className="pt-20">{children}</main>
      <SiteFooter />
    </>
  );
}
