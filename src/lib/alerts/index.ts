import { getMembership } from "@/lib/auth/scope";
import type { Membership } from "@/lib/authz";
import type { Deps } from "@/lib/deps";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { noticeEmail } from "@/lib/mail/templates";
import type { Alert, Tenant } from "@/lib/tenants";
import { defaultPrefs, KIND_LABEL, prefsId, routeAlert, type AlertPrefs } from "./routing";

export * from "./routing";

const membershipFor = async (deps: Deps, p: AlertPrefs): Promise<Membership> => getMembership(deps.db, p.orgId, p.userId, p.role);

/** Creates the user's preference row on first use and keeps the role fresh (the router needs it for scope). */
export async function ensurePrefs(deps: Deps, a: { orgId: string; userId: string; email: string; role: string }): Promise<AlertPrefs> {
  const col = deps.db.collection<AlertPrefs>("alert_prefs");
  const cur = await col.get(prefsId(a.orgId, a.userId));
  if (cur && cur.role === a.role && cur.email === a.email) return cur;
  const next = { ...(cur ?? defaultPrefs(a.orgId, a.userId, a.email, a.role)), role: a.role, email: a.email };
  await col.put(next);
  return next;
}

export async function savePrefs(deps: Deps, a: { orgId: string; userId: string; email: string; role: string }, patch: Partial<Pick<AlertPrefs, "inApp" | "emailOn" | "digest" | "mutedTenants">>): Promise<AlertPrefs> {
  const cur = await ensurePrefs(deps, a);
  if (patch.digest && patch.digest !== "instant" && patch.digest !== "daily") throw new HttpError(400, "invalid_input");
  const next: AlertPrefs = { ...cur, ...patch, mutedTenants: [...new Set(patch.mutedTenants ?? cur.mutedTenants)] };
  await deps.db.collection<AlertPrefs>("alert_prefs").put(next);
  return next;
}

const alertEmail = (deps: Deps, a: Alert, tenantName: string | null) => noticeEmail({
  title: `${KIND_LABEL[a.kind] ?? a.kind}${tenantName ? `: ${tenantName}` : ""}`,
  body: a.message,
  actionUrl: `${deps.baseUrl}/app${a.tenantId ? `?tenant=${a.tenantId}` : ""}`,
  actionLabel: "Open the dock",
});

/**
 * Stores the alert (the in-app centre reads the collection) and sends the instant emails according to each member's
 * preferences and tenant scope. `extraEmails` are addresses outside the member list (the ring config's alert email).
 * `dedupeKey` makes a repeated cause raise only one alert.
 */
export async function raiseAlert(deps: Deps, a: Omit<Alert, "id" | "createdAt" | "ackAt" | "ackBy"> & { extraEmails?: (string | null | undefined)[] }): Promise<Alert> {
  const { extraEmails = [], ...rest } = a;
  const col = deps.db.collection<Alert>("alerts");
  if (rest.dedupeKey) {
    const dup = (await col.find({ orgId: rest.orgId })).find((x) => x.dedupeKey === rest.dedupeKey);
    if (dup) return dup;
  }
  const alert: Alert = { ...rest, id: uuidv7(), createdAt: deps.now().toISOString(), ackAt: null, ackBy: null };
  await col.put(alert);
  const tenantName = alert.tenantId ? (await deps.db.collection<Tenant>("tenants").get(alert.tenantId))?.name ?? null : null;
  const sent = new Set<string>();
  const send = async (to: string) => {
    if (sent.has(to.toLowerCase())) return;
    sent.add(to.toLowerCase());
    try { await deps.sendMail({ to, ...alertEmail(deps, alert, tenantName), category: "transactional", tags: { kind: alert.kind } }); } catch { /* a mail outage must not fail the job that raised the alert */ }
  };
  for (const p of await deps.db.collection<AlertPrefs>("alert_prefs").find({ orgId: alert.orgId })) {
    if (routeAlert(alert, p, await membershipFor(deps, p)).email === "instant") await send(p.email);
  }
  for (const e of extraEmails) if (e) await send(e);
  return alert;
}

/** Alerts a member may see: their org, in tenant scope, and (for info/warning) not muted. Newest first. */
export async function listAlertsFor(deps: Deps, a: { orgId: string; userId: string; email: string; role: string }, limit = 50): Promise<{ alerts: Alert[]; unread: number }> {
  const prefs = await ensurePrefs(deps, a);
  const m = await membershipFor(deps, prefs);
  const all = (await deps.db.collection<Alert>("alerts").find({ orgId: a.orgId }))
    .filter((x) => routeAlert(x, prefs, m).inApp)
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  return { alerts: all.slice(0, limit), unread: all.filter((x) => !x.ackAt).length };
}

/** Acknowledge one alert (id) or every visible one ("all"). Acknowledgement is shared by the org. Out of scope alerts are untouchable. */
export async function acknowledge(deps: Deps, a: { orgId: string; userId: string; email: string; role: string }, id: string | "all"): Promise<number> {
  const prefs = await ensurePrefs(deps, a);
  const m = await membershipFor(deps, prefs);
  const col = deps.db.collection<Alert>("alerts");
  const targets = id === "all" ? (await col.find({ orgId: a.orgId })).filter((x) => !x.ackAt && routeAlert(x, prefs, m).inApp) : [await col.get(id)];
  let n = 0;
  for (const t of targets) {
    if (!t || t.orgId !== a.orgId || !routeAlert(t, prefs, m).inApp) { if (id !== "all") throw new HttpError(404, "not_found"); continue; }
    if (t.ackAt) continue;
    await col.put({ ...t, ackAt: deps.now().toISOString(), ackBy: a.userId });
    n++;
  }
  return n;
}

/** Cron `alert-digest`: one email per user with a daily digest, listing the info and warning alerts since the last one. */
export async function alertDigestJob(deps: Deps): Promise<{ users: number; sent: number }> {
  const out = { users: 0, sent: 0 };
  const now = deps.now();
  for (const p of await deps.db.collection<AlertPrefs>("alert_prefs").find()) {
    if (p.digest !== "daily" || !p.emailOn) continue;
    out.users++;
    if (p.lastDigestAt && now.getTime() - new Date(p.lastDigestAt).getTime() < 20 * 3_600_000) continue;
    const m = await membershipFor(deps, p);
    const since = p.lastDigestAt ?? new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const items = (await deps.db.collection<Alert>("alerts").find({ orgId: p.orgId }))
      .filter((x) => x.severity !== "critical" && x.createdAt >= since && routeAlert(x, p, m).email === "digest");
    await deps.db.collection<AlertPrefs>("alert_prefs").put({ ...p, lastDigestAt: now.toISOString() });
    if (!items.length) continue;
    try {
      await deps.sendMail({ to: p.email, ...noticeEmail({ title: `DockCrate digest: ${items.length} alert${items.length === 1 ? "" : "s"}`, body: items.map((x) => `${KIND_LABEL[x.kind] ?? x.kind}: ${x.message}`).join("\n"), actionUrl: `${deps.baseUrl}/app`, actionLabel: "Open the dock" }), category: "notification" });
      out.sent++;
    } catch { /* retried tomorrow's digest will not include these: acceptable for non critical alerts */ }
  }
  return out;
}

/** A catalog version came back with a different Authenticode signer: tell every org that has the app published. */
export async function raiseSignerChanged(deps: Deps, appSlug: string, version: string): Promise<number> {
  const orgs = new Set((await deps.db.collection<{ id: string; orgId: string; appSlug: string }>("tenant_apps").find()).filter((t) => t.appSlug === appSlug).map((t) => t.orgId));
  for (const orgId of orgs) {
    await raiseAlert(deps, { orgId, tenantId: null, severity: "critical", kind: "signer.changed", dedupeKey: `signer:${appSlug}@${version}:${orgId}`, message: `${appSlug} ${version} is signed by a different publisher certificate than the last verified version. It is held and will not be published until reviewed.` });
  }
  return orgs.size;
}
