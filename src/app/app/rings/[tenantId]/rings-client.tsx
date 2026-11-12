"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useAsync } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ErrorState, Notice, Skeleton } from "@/components/ui/states";
import { guessRingGroups } from "@/lib/rings/guess-groups";
import type { RingConfig } from "@/lib/rings/types";

interface Group { id: string; displayName: string }

export function RingsClient({ tenantId, canConfigure, initial }: { tenantId: string; canConfigure: boolean; initial: RingConfig | null }) {
  const router = useRouter();
  const groups = useAsync<Group[]>(async () => {
    const r = await api<{ groups: Group[] }>(`/api/tenants/${tenantId}/groups`);
    if (!r.ok) throw new Error(r.code === "tenant_not_connected" ? "This tenant is not connected." : "We could not read the tenant's groups. Check that Group.Read.All consent is still granted, then try again.");
    return r.data.groups;
  }, [tenantId]);
  const [pickedPilot, setPilot] = useState(initial?.pilot.groupId ?? "");
  const [pickedBroad, setBroad] = useState(initial?.broad.groupId ?? "");
  // First setup: preselect likely groups (DC-Pilot / DC-Broad, "Pilot", "All users"...) until the user picks.
  const guess = !initial && groups.data ? guessRingGroups(groups.data) : { pilot: "", broad: "" };
  const pilot = pickedPilot || guess.pilot;
  const broad = pickedBroad || guess.broad;
  const [pilotDelay, setPilotDelay] = useState(String(initial?.pilot.delayHours ?? 0));
  const [broadDelay, setBroadDelay] = useState(String(initial?.broad.delayHours ?? 48));
  const [threshold, setThreshold] = useState(String(initial?.failThresholdPct ?? 10));
  const [intent, setIntent] = useState<"required" | "available">(initial?.intent ?? "required");
  const [autoUpdate, setAutoUpdate] = useState(initial?.autoUpdateDefault ?? true);
  const [alertEmail, setAlertEmail] = useState(initial?.alertEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await api("/api/rings", {
      body: {
        tenantId, pilot: { id: pilot }, broad: { id: broad }, pilotDelayHours: Number(pilotDelay), broadDelayHours: Number(broadDelay),
        failThresholdPct: Number(threshold), intent, autoUpdateDefault: autoUpdate, alertEmail: alertEmail.trim() || null,
      },
    });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.code === "invalid_input" ? "Check the numbers: delays are whole hours and the threshold is 1 to 100." : r.message });
    // First setup goes straight back to the dock, where the next step (Publish to Pilot) is waiting.
    if (!initial) return router.push(`/app?tenant=${tenantId}&rings=saved`);
    setMsg({ ok: true, text: "Rings saved. You can publish now." });
    router.refresh();
  }

  if (groups.loading) return <div aria-busy="true" aria-label="Loading groups" className="flex flex-col gap-3"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (groups.error || !groups.data) return <ErrorState title="Could not load groups" body={groups.error ?? "Try again."} action={<Button onClick={groups.reload}>Try again</Button>} />;
  if (groups.data.length < 2) return <Notice tone="warning" title="Create two groups first">This tenant has fewer than two Entra groups. Create a Pilot group (a few IT devices) and a Broad group (everyone else) in Entra, then reload. DockCrate never creates or changes groups.</Notice>;

  const options = groups.data;
  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      {!initial ? <Notice tone="info" title="Rings are not set up yet">{guess.pilot && guess.broad ? "We picked the two groups that look like Pilot and Broad. Check them, then save. The defaults below suit most tenants." : "Pick the two groups below. Until you save, the dock cannot publish to this tenant."}</Notice> : null}
      <Panel title="Groups" description="Pilot gets each update first. Broad gets it after the delay, if Pilot stays healthy.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pilot group" htmlFor="r-pilot"><Select id="r-pilot" value={pilot} onChange={(e) => setPilot(e.target.value)} required disabled={!canConfigure}><option value="" disabled>Choose a group</option>{options.map((g) => <option key={g.id} value={g.id}>{g.displayName}</option>)}</Select></Field>
          <Field label="Broad group" htmlFor="r-broad"><Select id="r-broad" value={broad} onChange={(e) => setBroad(e.target.value)} required disabled={!canConfigure}><option value="" disabled>Choose a group</option>{options.map((g) => <option key={g.id} value={g.id}>{g.displayName}</option>)}</Select></Field>
        </div>
      </Panel>
      <Panel title="Timing and safety">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Pilot delay (hours)" htmlFor="r-pd" hint="0 publishes to Pilot at once."><Input id="r-pd" type="number" min={0} max={720} step={1} inputMode="numeric" value={pilotDelay} onChange={(e) => setPilotDelay(e.target.value)} disabled={!canConfigure} /></Field>
          <Field label="Broad delay (hours)" htmlFor="r-bd" hint="Time after Pilot before Broad. Default 48."><Input id="r-bd" type="number" min={0} max={720} step={1} inputMode="numeric" value={broadDelay} onChange={(e) => setBroadDelay(e.target.value)} disabled={!canConfigure} /></Field>
          <Field label="Pause threshold (%)" htmlFor="r-th" hint="Pilot failures at or over this pause Broad. Default 10."><Input id="r-th" type="number" min={1} max={100} step={1} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={!canConfigure} /></Field>
        </div>
      </Panel>
      <Panel title="Defaults">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Install intent" htmlFor="r-intent"><Select id="r-intent" value={intent} onChange={(e) => setIntent(e.target.value as "required" | "available")} disabled={!canConfigure}><option value="required">Required</option><option value="available">Available</option></Select></Field>
            <Field label="Alert email" htmlFor="r-mail" hint="Optional. Gets a message when a ring pauses."><Input id="r-mail" type="email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="noc@yourmsp.com" disabled={!canConfigure} /></Field>
          </div>
          <label htmlFor="r-auto" className="flex min-h-11 items-center gap-3 body-6 text-text">
            <input id="r-auto" type="checkbox" className="size-5 accent-[var(--color-action)]" checked={autoUpdate} onChange={(e) => setAutoUpdate(e.target.checked)} disabled={!canConfigure} />
            Auto update new apps in this tenant (you can turn it off per app)
          </label>
        </div>
      </Panel>
      {!canConfigure ? <Notice tone="info">Your role can view rings but not change them. Ask an owner or admin.</Notice> : null}
      {msg ? <Notice tone={msg.ok ? "success" : "danger"} action={msg.ok ? <Link href={`/app?tenant=${tenantId}`} className="button-sm inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-3 py-2 text-text focus-visible:focus-ring">Back to the dock</Link> : undefined}>{msg.text}</Notice> : null}
      <div><Button type="submit" loading={busy} disabled={!canConfigure || !pilot || !broad}>Save rings</Button></div>
    </form>
  );
}
