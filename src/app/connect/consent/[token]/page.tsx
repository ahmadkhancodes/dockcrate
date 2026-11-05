import { redirect } from "next/navigation";
import { defaultDeps } from "@/lib/deps";
import { consentUrlForLink } from "@/lib/tenants";
import { product } from "@/config/product";

export const metadata = { title: "Approve DockCrate", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Opened by an IT admin from the emailed link. No DockCrate login: Microsoft's consent page authenticates them. */
export default async function ConsentLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = consentUrlForLink(await defaultDeps(), token);
  if (url) redirect(url);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="heading-5 text-text">This link has expired</h1>
      <p className="body-6 text-text-subtle">Consent links work for 7 days. Ask the person who sent it to send a new one from {product.name}.</p>
    </main>
  );
}
