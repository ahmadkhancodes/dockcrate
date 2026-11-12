import { cn } from "./cn";

/** The DockCrate by BufferSol wordmark: a braced crate in graphite on a teal dock line, the name stencilled, the maker in mono. */
export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-text", className)}>
      <svg aria-hidden width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
        <rect x="2.75" y="2.75" width="16.5" height="12.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M3 15 19 3" stroke="currentColor" strokeWidth="2" />
        <rect x="0" y="18" width="22" height="3" fill="var(--accent)" />
      </svg>
      <span className="flex items-baseline gap-2">
        <span className="stencil title-2 uppercase leading-none tracking-[0.04em]">DockCrate</span>
        {compact ? null : <span className="font-mono caption-5 leading-none text-text-subtle">by BufferSol</span>}
      </span>
    </span>
  );
}
