"use client";
import { useState } from "react";
import { api, useAsync } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/states";

interface Prefs { inApp: boolean; emailOn: boolean; digest: "instant" | "daily"; mutedTenants: string[] }
interface Data { prefs: Prefs; tenants: { id: string; name: string }[] }

const EVENTS = ["Ring paused", "Tenant disconnected", "Signer changed", "Consent revoked", "Device limit grace ending"];

export function NotificationsClient() {
  const q = useAsync<Data>(async () => { const r = await api<Data>("/api/alerts/prefs"); if (!r.ok) throw new Error(r.message); return r.data; }, []);
  const [draft, setDraft] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const prefs = draft ?? q.data?.prefs;

  if (q.loading) return <Skeleton className="h-48 w-full" />;
  if (q.error || !prefs || !q.data) return <ErrorState title="Settings did not load" body={q.error ?? ""} action={<Button onClick={q.reload}>Try again</Button>} />;
  const set = (p: Partial<Prefs>) => { setDraft({ ...prefs, ...p }); setMsg(null); };
  const toggleTenant = (id: string) => set({ mutedTenants: prefs.mutedTenants.includes(id) ? prefs.mutedTenants.filter((x) => x !== id) : [...prefs.mutedTenants, id] });

  async function save() {
    setSaving(true);
    const r = await api("/api/alerts/prefs", { method: "PUT", body: prefs });
    setSaving(false);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.message });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-6">
      <Panel title="Channels" description={`Critical events: ${EVENTS.join(", ").toLowerCase()}. They always appear in the alert centre; turning email off stops the emails.`}>
        <div className="flex flex-col gap-1">
          <label className="flex min-h-11 items-center gap-3 body-5 text-text"><input type="checkbox" checked={prefs.emailOn} onChange={(e) => set({ emailOn: e.target.checked })} /> Email me</label>
          <label className="flex min-h-11 items-center gap-3 body-5 text-text"><input type="checkbox" checked={prefs.inApp} onChange={(e) => set({ inApp: e.target.checked })} /> Show warnings and info in the alert centre (critical always shows)</label>
        </div>
      </Panel>
      <Panel title="Digest" description="Critical alerts are always emailed at once. Warnings and info can be batched into one daily email.">
        <label htmlFor="digest" className="sr-only">Email timing for warnings and info</label>
        <Select id="digest" value={prefs.digest} onChange={(e) => set({ digest: e.target.value as Prefs["digest"] })} className="max-w-xs">
          <option value="instant">Send each one at once</option>
          <option value="daily">One daily digest</option>
        </Select>
      </Panel>
      <Panel title="Tenants" description="Mute a tenant to stop its emails and its warnings. Critical events from a muted tenant still show in the alert centre.">
        {q.data.tenants.length === 0 ? <p className="caption-2 text-text-subtle">No tenants yet.</p> : (
          <div className="flex flex-col gap-1">
            {q.data.tenants.map((t) => (
              <label key={t.id} className="flex min-h-11 items-center gap-3 body-5 text-text"><input type="checkbox" checked={prefs.mutedTenants.includes(t.id)} onChange={() => toggleTenant(t.id)} /> Mute {t.name}</label>
            ))}
          </div>
        )}
      </Panel>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>Save settings</Button>
        {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "caption-2 text-success" : "caption-2 text-danger"}>{msg.text}</p> : null}
      </div>
    </form>
  );
}
