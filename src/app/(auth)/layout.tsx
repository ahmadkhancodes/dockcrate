import { ArrowLeft, Check } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { product } from "@/config/product";
import { Wordmark } from "@/components/ui/wordmark";
import { permissions } from "@/content/security";

const afterSignIn = [
  "Connect a client tenant. An admin approves three permissions once.",
  "Pick a Pilot group and a Broad group. Defaults: 0 h and 48 h.",
  "Publish from the catalog. New versions follow the rings on their own.",
];

/** Auth screens: the form on the light concrete panel on the left, what happens next on the canvas on the right (desktop only). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface-raised lg:grid-cols-12">
      <div className="flex min-h-dvh flex-col lg:col-span-7">
        <header className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-12">
          <Link href="/" aria-label={`${product.fullName} home`} className="inline-flex min-h-11 items-center rounded-sm focus-visible:focus-ring"><Wordmark /></Link>
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-12">
          <div className="mx-auto flex w-full max-w-md flex-col gap-8 lg:mx-0 lg:ml-12">{children}</div>
        </main>
        <footer className="px-4 py-4 sm:px-6 lg:px-12">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-sm body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">
            <ArrowLeft size={16} weight="regular" aria-hidden />
            Back to {product.name}
          </Link>
        </footer>
      </div>
      <aside aria-label="What happens after you sign in" className="hidden flex-col justify-center gap-8 border-l-2 border-text bg-surface px-12 py-16 lg:col-span-5 lg:flex">
        <div className="flex max-w-md flex-col gap-4">
          <p className="label-caps text-text-muted">After you sign in</p>
          <ol className="flex flex-col border-t border-text">
            {afterSignIn.map((s, i) => (
              <li key={s} className="grid grid-cols-[2rem_1fr] gap-2 border-b border-border py-3">
                <span className="font-mono caption-4 tnum text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="body-6 text-text">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex max-w-md flex-col gap-3">
          <p className="label-caps text-text-muted">The only Graph permissions we ask for</p>
          <ul className="flex flex-col gap-1">
            {permissions.map((p) => (
              <li key={p.name} className="flex items-center gap-2 font-mono caption-2 text-text"><Check size={14} weight="bold" aria-hidden className="shrink-0 text-success" />{p.name}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
