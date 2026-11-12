"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/app/api";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, EmptyState, Notice } from "@/components/ui/states";
import { product, UNLIMITED } from "@/config/product";
import type { UpgradeHint } from "@/lib/billing/limits";
import { STATUS_LABEL, type Tenant, type TenantStatus } from "@/lib/tenants/labels";

const tone = { connected: "success", waiting_consent: "warning", disconnected: "danger", pending: "info" } as const;

function TenantRow({ initial, canConnect }: { initial: Tenant; canConnect: boolean }) {
  const [t, setT] = useState(initial);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // "Connected" shows within about a minute of consent: poll the status (which re-verifies) while waiting.
  useEffect(() => {
    if (t.status !== "waiting_consent" || !t.entraTenantId) return;
    let alive = true, n = 0;
    const id = setInterval(async () => {
      if (++n > 24) return clearInterval(id);
      const r = await api<{ tenant: Tenant }>(`/api/tenants/${t.id}`);
      if (alive && r.ok) setT(r.data.tenant);
    }, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [t.id, t.status, t.entraTenantId]);

  async function connect() {
    setBusy("connect");
    const r = await api<{ consentUrl: string | null }>(`/api/tenants/${t.id}`);
    if (!r.ok) { setBusy(null); return setMsg({ ok: false, text: r.message }); }
    if (!r.data.consentUrl) { setBusy(null); return setMsg({ ok: false, text: "Connecting a Microsoft tenant opens with early access. We have not switched it on for your account yet." }); }
    window.location.assign(r.data.consentUrl);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy("send");
    setMsg(null);
    const r = await api<{ tenant: Tenant }>(`/api/tenants/${t.id}/consent-link`, { body: { email } });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: r.code === "invalid_input" ? "Enter a valid admin email address." : r.message });
    setT(r.data.tenant);
    setMsg({ ok: true, text: `Link sent to ${email}. It works for 7 days.` });
  }

  const status: TenantStatus = t.status;
  return (
    <li className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="title-3 text-text">{t.name}</p>
          <p className="font-mono caption-2 text-text-subtle">{t.entraTenantId ?? "No Microsoft tenant linked yet"}</p>
        </div>
        <span aria-live="polite"><Badge tone={tone[status]}>{STATUS_LABEL[status]}</Badge></span>
      </div>
      {status === "waiting_consent" && t.consentSentTo ? <p className="body-6 text-text-subtle">Consent link sent to {t.consentSentTo}. This updates when they approve.</p> : null}
      {t.lastError && status !== "connected" ? <p className="body-6 text-text-subtle">{t.lastError}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {status !== "connected" ? <Button onClick={connect} disabled={!canConnect} loading={busy === "connect"}>{status === "disconnected" ? "Reconnect" : "Connect with Microsoft"}</Button> : null}
        <Link href={`/app?tenant=${t.id}`} className={buttonClass("secondary")}>Open dock</Link>
      </div>
      {status !== "connected" && canConnect ? (
        <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1"><Field label="Not an admin? Send consent link to admin" htmlFor={`admin-${t.id}`}><Input id={`admin-${t.id}`} type="email" required placeholder="it-admin@customer.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
          <Button type="submit" variant="secondary" loading={busy === "send"}>Send link</Button>
        </form>
      ) : null}
      {msg ? <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice> : null}
    </li>
  );
}

export interface TenantCap { planName: string; limit: number; upgrade: UpgradeHint | null }

/** Shown instead of the add form when the plan's tenants are all in use, so the next step is an upgrade, not an error. */
export function TenantCapNotice({ cap }: { cap: TenantCap }) {
  const u = cap.upgrade;
  return (
    <Notice tone="info" title={`Your ${cap.planName} plan includes ${cap.limit} tenant${cap.limit === 1 ? "" : "s"}, all in use`}
      action={u ? <Link href={u.href} className={buttonClass("primary")}>Upgrade to {u.planName}</Link> : <a href={`mailto:${product.supportEmail}`} className={buttonClass("secondary")}>Contact us</a>}>
      {u ? `${u.planName} adds ${u.limit >= UNLIMITED ? "unlimited tenants" : `up to ${u.limit} tenants`}${u.monthlyUsd ? ` for $${u.monthlyUsd.toFixed(2)} a month` : ""}. Your connected tenants, rings and apps stay as they are.` : "Write to us about a larger plan."}
    </Notice>
  );
}

export function TenantsClient({ tenants, canConnect, cap = null }: { tenants: Tenant[]; canConnect: boolean; cap?: TenantCap | null }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Enter the customer's name, at least 2 characters.");
    setBusy(true);
    setError(null);
    const r = await api<{ consentUrl: string }>("/api/tenants", { body: { name: name.trim() } });
    if (!r.ok) { setBusy(false); if (r.code === "limit_reached") setLimitHit(true); return setError(r.message); }
    window.location.assign(r.data.consentUrl);
  }

  return (
    <div className="flex flex-col gap-6">
      {canConnect && cap ? <TenantCapNotice cap={cap} /> : canConnect ? (
        <form onSubmit={create} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:flex-row sm:items-end">
          <div className="flex-1"><Field label="Customer name" htmlFor="tenant-name" error={error}><Input id="tenant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Halvorsen Dental" autoComplete="off" /></Field></div>
          <Button type="submit" loading={busy}>Add and connect</Button>
        </form>
      ) : <Notice tone="info">Your role can view tenants but not connect them.</Notice>}
      {limitHit && !cap ? <Link href="/app/billing" className={`${buttonClass("secondary")} self-start`}>See plans</Link> : null}
      {tenants.length === 0 ? (
        <EmptyState title="No tenants yet" body="Add a customer above. An admin of that Microsoft tenant approves DockCrate once, and it shows as Connected within a minute." />
      ) : (
        <ul aria-label="Tenants" className="flex flex-col gap-4">{tenants.map((t) => <TenantRow key={t.id} initial={t} canConnect={canConnect} />)}</ul>
      )}
    </div>
  );
}
