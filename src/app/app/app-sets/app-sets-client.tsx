"use client";
import { ArrowsClockwise, Play } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api, formatDate } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, EmptyState, Notice } from "@/components/ui/states";
import type { AppSet, AppSetRun, TenantRunResult } from "@/lib/appsets";

interface AppOpt { slug: string; name: string; publishable: boolean }
interface TenantOpt { id: string; name: string; connected: boolean }

const tone = { queued: "info", running: "warning", succeeded: "success", failed: "danger" } as const;
const label = { queued: "Queued", running: "Running", succeeded: "Done", failed: "Failed" } as const;

function Check({ id, checked, onChange, children, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 body-6 text-text">
      <input id={id} type="checkbox" className="size-5 accent-[var(--color-action)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function RunProgress({ initial, canRun }: { initial: AppSetRun; canRun: boolean }) {
  const [run, setRun] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (run.status !== "running") return;
    let alive = true;
    const id = setInterval(async () => {
      const r = await api<{ run: AppSetRun }>(`/api/app-set-runs/${run.id}`);
      if (alive && r.ok) setRun(r.data.run);
    }, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [run.id, run.status]);
  const done = run.results.filter((r) => r.status === "succeeded" || r.status === "failed").length;
  const failed = run.results.filter((r) => r.status === "failed").length;
  async function retry() {
    setBusy(true);
    setMsg(null);
    const r = await api<{ run: AppSetRun }>(`/api/app-set-runs/${run.id}`, { method: "POST", body: {} });
    setBusy(false);
    if (!r.ok) return setMsg(r.message);
    setRun(r.data.run);
  }
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="title-4 text-text">{run.appSetName}</p>
          <p className="caption-2 text-text-subtle">{formatDate(run.createdAt, true)}</p>
        </div>
        <Badge tone={run.status === "running" ? "warning" : failed ? "danger" : "success"}>{run.status === "running" ? `${done} of ${run.results.length} tenants` : failed ? `${failed} failed` : "Completed"}</Badge>
      </div>
      <div role="progressbar" aria-label="Tenants finished" aria-valuemin={0} aria-valuemax={run.results.length} aria-valuenow={done} aria-valuetext={`${done} of ${run.results.length} tenants finished`} className="h-2 overflow-hidden rounded-sm bg-surface-sunken">
        <div className="h-full bg-action transition-[width] duration-300" style={{ width: `${run.results.length ? (done / run.results.length) * 100 : 0}%` }} />
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {run.results.map((r: TenantRunResult) => (
          <li key={r.tenantId} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="body-6 text-text">{r.tenantName}</p>
              {r.error ? <p className="caption-2 text-text-subtle">{r.error}</p> : r.apps.length ? <p className="caption-2 text-text-subtle">{r.apps.filter((a) => a.status === "published").length} of {r.apps.length} apps published to Pilot</p> : null}
            </div>
            <Badge tone={tone[r.status]}>{label[r.status]}{r.attempts > 1 ? ` (try ${r.attempts})` : ""}</Badge>
          </li>
        ))}
      </ul>
      {failed > 0 && run.status === "completed" && canRun ? <div><Button variant="secondary" loading={busy} onClick={retry}><ArrowsClockwise size={16} aria-hidden /> Retry {failed} failed tenant{failed === 1 ? "" : "s"}</Button></div> : null}
      {msg ? <Notice tone="danger">{msg}</Notice> : null}
    </li>
  );
}

function SetCard({ set, apps, tenants, canRun, allowed, onStarted, onDeleted }: { set: AppSet; apps: AppOpt[]; tenants: TenantOpt[]; canRun: boolean; allowed: boolean; onStarted: (r: AppSetRun) => void; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const names = set.appSlugs.map((s) => apps.find((a) => a.slug === s)?.name ?? s);
  async function start() {
    setBusy(true);
    setErr(null);
    const r = await api<{ run: AppSetRun }>(`/api/app-sets/${set.id}/runs`, { body: { tenantIds: picked } });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setOpen(false);
    setPicked([]);
    onStarted(r.data.run);
  }
  async function remove() {
    const r = await api(`/api/app-sets/${set.id}`, { method: "DELETE" });
    if (r.ok) onDeleted(set.id); else setErr(r.message);
  }
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="title-3 text-text">{set.name}</p>
          <p className="body-6 text-text-subtle">{names.join(", ")}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Badge tone="info">{set.intent === "required" ? "Required" : "Available"}</Badge><Badge tone={set.autoUpdate ? "success" : "warning"}>{set.autoUpdate ? "Auto update on" : "Auto update off"}</Badge></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canRun || !allowed} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${set.id}-tenants`} aria-label={`Run ${set.name} on tenants`}><Play size={16} aria-hidden /> Run on tenants</Button>
        <Button variant="tertiary" disabled={!canRun || !allowed} onClick={remove} aria-label={`Delete ${set.name}`}>Delete</Button>
      </div>
      {open ? (
        <fieldset id={`${set.id}-tenants`} className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3">
          <legend className="caption-3 px-1 text-text-subtle">Tenants</legend>
          {tenants.map((t) => <Check key={t.id} id={`${set.id}-${t.id}`} checked={picked.includes(t.id)} onChange={(v) => setPicked((p) => (v ? [...p, t.id] : p.filter((x) => x !== t.id)))}>{t.name}{t.connected ? "" : " (not connected: will fail)"}</Check>)}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setPicked(tenants.filter((t) => t.connected).map((t) => t.id))}>Select connected</Button>
            <Button disabled={picked.length === 0} loading={busy} onClick={start}>Start run ({picked.length})</Button>
          </div>
        </fieldset>
      ) : null}
      {err ? <Notice tone="danger">{err}</Notice> : null}
    </li>
  );
}

export function AppSetsClient({ allowed, canRun, sets: initialSets, apps, tenants, runs: initialRuns }: { allowed: boolean; canRun: boolean; sets: AppSet[]; apps: AppOpt[]; tenants: TenantOpt[]; runs: AppSetRun[] }) {
  const [sets, setSets] = useState(initialSets);
  const [runs, setRuns] = useState(initialRuns);
  const [name, setName] = useState("");
  const [slugs, setSlugs] = useState<string[]>([]);
  const [intent, setIntent] = useState<"required" | "available">("required");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ set: AppSet }>("/api/app-sets", { body: { name, appSlugs: slugs, intent, autoUpdate } });
    setBusy(false);
    if (!r.ok) return setError(r.code === "plan_required" ? "App Sets start on the Professional plan." : r.message);
    setSets((s) => [...s, r.data.set]);
    setName("");
    setSlugs([]);
  }

  return (
    <div className="flex flex-col gap-6">
      {canRun && allowed ? (
        <Panel title="New App Set" description="Pick the apps and the ring defaults every tenant gets.">
          <form onSubmit={create} className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="set-name"><Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New laptop baseline" autoComplete="off" /></Field>
              <Field label="Install intent" htmlFor="set-intent" hint="Required installs on the group; Available shows in Company Portal."><Select id="set-intent" value={intent} onChange={(e) => setIntent(e.target.value as "required" | "available")}><option value="required">Required</option><option value="available">Available</option></Select></Field>
            </div>
            <fieldset className="grid gap-x-4 sm:grid-cols-2">
              <legend className="caption-3 pb-1 text-text-subtle">Apps</legend>
              {apps.map((a) => <Check key={a.slug} id={`new-${a.slug}`} checked={slugs.includes(a.slug)} onChange={(v) => setSlugs((p) => (v ? [...p, a.slug] : p.filter((x) => x !== a.slug)))}>{a.name}{a.publishable ? "" : " (held in QA)"}</Check>)}
            </fieldset>
            <Check id="set-auto" checked={autoUpdate} onChange={setAutoUpdate}>Auto update these apps in every tenant</Check>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div><Button type="submit" loading={busy} disabled={slugs.length === 0}>Save App Set</Button></div>
          </form>
        </Panel>
      ) : null}
      {sets.length === 0 ? (
        <EmptyState title="No App Sets yet" body="Group the apps every new client gets, then publish them to many tenants in one run. Each tenant reports its own result and failures can be retried." />
      ) : (
        <ul className="flex flex-col gap-4" aria-label="App Sets">{sets.map((s) => <SetCard key={s.id} set={s} apps={apps} tenants={tenants} canRun={canRun} allowed={allowed} onStarted={(r) => setRuns((x) => [r, ...x])} onDeleted={(id) => setSets((x) => x.filter((y) => y.id !== id))} />)}</ul>
      )}
      <Panel title="Runs" description="Newest first. Running ones update on their own.">
        {runs.length === 0 ? <p className="body-6 text-text-subtle">No runs yet.</p> : <ul className="flex flex-col gap-4">{runs.map((r) => <RunProgress key={r.id} initial={r} canRun={canRun} />)}</ul>}
      </Panel>
    </div>
  );
}
