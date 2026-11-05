"use client";
import { Bell } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatDate } from "./api";
import { cn } from "@/components/ui/cn";

interface A { id: string; kind: string; severity: "info" | "warning" | "critical"; message: string; createdAt: string; ackAt?: string | null; tenantId: string | null }
interface Res { alerts: A[]; unread: number }

const LABEL: Record<string, string> = {
  "ring.paused": "Ring paused", "tenant.disconnected": "Tenant disconnected", "signer.changed": "Signer changed",
  "consent.revoked": "Consent revoked", "device.grace_ending": "Device limit grace ending",
};

/** Bell with unread count and a list of alerts. Acknowledge one or all. Polls every 90 s while the tab is visible. */
export function AlertBell() {
  const [data, setData] = useState<Res | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api<Res>("/api/alerts");
    if (r.ok) { setData(r.data); setError(false); } else setError(true);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 90_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const click = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, [open]);

  async function ack(id: string) {
    setBusy(id);
    await api("/api/alerts", { method: "POST", body: { id } });
    await load();
    setBusy(null);
  }

  const unread = data?.unread ?? 0;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen((o) => !o); if (!open) void load(); }}
        className="relative inline-flex size-11 items-center justify-center rounded-md text-text transition-colors duration-300 hover:bg-surface-raised focus-visible:focus-ring"
      >
        <Bell size={22} weight="regular" aria-hidden />
        {unread ? <span className="absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1 caption-5 tnum text-white">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Alert centre" className="fixed left-4 right-4 top-16 z-50 flex max-h-[70dvh] flex-col rounded-lg border border-border bg-surface shadow-lg sm:left-auto sm:w-96 lg:left-4 lg:right-auto">
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <p className="title-4 text-text">Alerts</p>
            <div className="flex items-center gap-1">
              {unread ? <button type="button" disabled={busy === "all"} onClick={() => ack("all")} className="min-h-11 rounded-md px-3 body-5 text-text hover:bg-surface-raised focus-visible:focus-ring">Acknowledge all</button> : null}
              <Link href="/app/settings/notifications" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-md px-3 body-5 text-text-subtle hover:bg-surface-raised focus-visible:focus-ring">Settings</Link>
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {error ? <li className="p-4 body-6 text-danger" role="alert">Alerts did not load. They will retry in a minute.</li> : null}
            {!error && data && data.alerts.length === 0 ? <li className="p-4 body-6 text-text-subtle">No alerts. Ring pauses, disconnected tenants and similar events show up here and by email.</li> : null}
            {!data && !error ? <li className="p-4 body-6 text-text-subtle">Loading alerts</li> : null}
            {data?.alerts.map((a) => (
              <li key={a.id} className={cn("flex flex-col gap-1 p-3", a.ackAt && "opacity-60")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="title-5 text-text">{a.severity === "critical" ? <span className="sr-only">Critical: </span> : null}{LABEL[a.kind] ?? a.kind}</p>
                  <time className="caption-5 text-text-muted" dateTime={a.createdAt}>{formatDate(a.createdAt, true)}</time>
                </div>
                <p className="body-6 text-text-subtle">{a.message}</p>
                {!a.ackAt ? <div><button type="button" disabled={busy === a.id} onClick={() => ack(a.id)} className="min-h-11 rounded-md px-3 body-5 text-text underline hover:bg-surface-raised focus-visible:focus-ring">Acknowledge</button></div> : <p className="caption-5 text-text-muted">Acknowledged</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
