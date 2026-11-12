import { cn } from "./cn";

/** The DockCrate by BufferSol wordmark: a graphite crate on a lime dock line, the name in the display face, the maker in mono. */
export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-text", className)}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" className="shrink-0">
        <rect x="3" y="3" width="14" height="11" fill="currentColor" />
        <rect x="3" y="8" width="14" height="1.5" fill="var(--surface-raised)" />
        <rect x="0" y="16" width="20" height="2.5" fill="var(--mark)" />
      </svg>
      <span className="flex items-baseline gap-2">
        <span className="title-2 font-display font-semibold leading-none [font-stretch:112%]">DockCrate</span>
        {compact ? null : <span className="font-mono caption-5 leading-none text-text-subtle">by BufferSol</span>}
      </span>
    </span>
  );
}
