"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/states";

interface Data { role: string; scope: "all" | string[]; tenants: { id: string; name: string }[] }

/** Edits which tenants an operator or viewer can see and act on. Owners and admins always see all. */
export function ScopeEditor({ userId, who, onClose, onSaved }: { userId: string; who: string; onClose: () => void; onSaved: (text: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    api<Data>(`/api/members/${userId}/scope`).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.message);
      setData(r.data);
      setAll(r.data.scope === "all");
      setPicked(new Set(r.data.scope === "all" ? [] : r.data.scope));
    });
    return () => { live = false; };
  }, [userId]);

  async function save() {
    setSaving(true);
    setError(null);
    const r = await api<{ scope: "all" | string[] }>(`/api/members/${userId}/scope`, { method: "PUT", body: { scope: all ? "all" : [...picked] } });
    setSaving(false);
    if (!r.ok) return setError(r.message);
    onSaved(`${who} can now see ${r.data.scope === "all" ? "all tenants" : `${r.data.scope.length} tenant${r.data.scope.length === 1 ? "" : "s"}`}.`);
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Panel title={`Tenant access for ${who}`} description="A technician only sees the tenants listed here: in the dock, the MSP view, rings and alerts.">
      {!data && !error ? <Skeleton className="h-24 w-full" /> : null}
      {error && !data ? <ErrorState title="Could not load access" body={error} action={<Button onClick={onClose}>Close</Button>} /> : null}
      {data ? (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="title-4 text-text">Which tenants</legend>
            <label className="flex min-h-11 items-center gap-3 body-5 text-text"><input type="radio" name="scope" checked={all} onChange={() => setAll(true)} /> All tenants, including new ones</label>
            <label className="flex min-h-11 items-center gap-3 body-5 text-text"><input type="radio" name="scope" checked={!all} onChange={() => setAll(false)} /> Only the tenants I pick</label>
          </fieldset>
          {!all ? (
            data.tenants.length === 0 ? <p className="caption-2 text-text-subtle">No tenants yet. Connect one first, or keep all tenants.</p> : (
              <fieldset className="flex flex-col gap-1 rounded-md border border-border p-3">
                <legend className="px-1 caption-3 text-text-muted">Tenants</legend>
                {data.tenants.map((t) => (
                  <label key={t.id} className="flex min-h-11 items-center gap-3 body-5 text-text"><input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} /> {t.name}</label>
                ))}
              </fieldset>
            )
          ) : null}
          {error ? <p role="alert" className="caption-2 text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" loading={saving} disabled={!all && picked.size === 0}>Save access</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </Panel>
  );
}
