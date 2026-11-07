import { entraClientId } from "@/lib/env";
import { PERSONAL_MSA_TENANT } from "@/lib/auth/entra";
import type { Deps } from "@/lib/deps";
import { GraphConsentError } from "@/lib/graph/types";
import { noticeEmail } from "@/lib/mail/templates";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { signToken, verifyToken } from "@/lib/signed";
import { buildProofUrl, newNonce, verifyAdminIdToken } from "./proof";
import { audit } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
export { raiseAlert };

import { STATUS_LABEL, type TenantStatus } from "./labels";
export { STATUS_LABEL, type TenantStatus };

export interface Tenant {
  id: string;
  orgId: string;
  name: string;
  /** Known after the consent callback. Unique per org. */
  entraTenantId: string | null;
  status: TenantStatus;
  /** Admin the consent link was emailed to ("Waiting for admin"). */
  consentSentTo: string | null;
  lastError: string | null;
  paused: boolean;
  connectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  orgId: string;
  tenantId: string | null;
  severity: "info" | "warning" | "critical";
  kind: string;
  message: string;
  createdAt: string;
  /** Set when someone acknowledges the alert in the in-app centre. */
  ackAt?: string | null;
  ackBy?: string | null;
  /** Repeats of the same cause raise one alert. */
  dedupeKey?: string;
}

/** What each requested permission is for. The consent denied message names the missing one and why. */
export const PERMISSIONS = [
  { name: "DeviceManagementApps.ReadWrite.All", why: "Create and update the Win32 apps we publish (named with the prefix \"DC |\") and assign them to your groups. Graph cannot scope this to our apps only." },
  { name: "DeviceManagementManagedDevices.Read.All", why: "Count managed Windows devices for billing and read install results for rings." },
  { name: "Group.Read.All", why: "List your groups so you can pick the Pilot and Broad groups. We never change groups." },
] as const;


const STATE_TTL = 60 * 60 * 1000;
const LINK_TTL = 7 * 24 * 60 * 60 * 1000;

export function consentRedirectUri(baseUrl: string) {
  return `${baseUrl}/api/tenants/consent/callback`;
}

/** The admin consent URL for our multi tenant app. `state` is a signed nonce that carries the org and tenant row. */
export function buildConsentUrl(opts: { baseUrl: string; orgId: string; tenantId: string; clientId?: string; now?: number }): string {
  const clientId = opts.clientId ?? entraClientId() ?? "";
  const state = signToken({ t: opts.tenantId, o: opts.orgId, k: "state" }, STATE_TTL, opts.now);
  const q = new URLSearchParams({ client_id: clientId, scope: "https://graph.microsoft.com/.default", redirect_uri: consentRedirectUri(opts.baseUrl), state });
  return `https://login.microsoftonline.com/organizations/v2.0/adminconsent?${q}`;
}

export async function createTenant(deps: Deps, input: { orgId: string; name: string; actorId: string | null }): Promise<Tenant> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, "invalid_name");
  const now = deps.now().toISOString();
  const t: Tenant = { id: uuidv7(), orgId: input.orgId, name, entraTenantId: null, status: "pending", consentSentTo: null, lastError: null, paused: false, connectedAt: null, createdAt: now, updatedAt: now };
  await deps.db.collection<Tenant>("tenants").put(t);
  await audit({ orgId: input.orgId, actorId: input.actorId, action: "tenant.created", target: t.id, meta: { tenantId: t.id } });
  return t;
}

export async function getTenant(deps: Deps, orgId: string, id: string): Promise<Tenant> {
  const t = await deps.db.collection<Tenant>("tenants").get(id);
  if (!t || t.orgId !== orgId) throw new HttpError(404, "tenant_not_found");
  return t;
}

async function save(deps: Deps, t: Tenant, patch: Partial<Tenant>): Promise<Tenant> {
  const next = { ...t, ...patch, updatedAt: deps.now().toISOString() };
  await deps.db.collection<Tenant>("tenants").put(next);
  return next;
}


/** Message for a consent error code from Microsoft, naming the permission and why we need it. */
export function consentErrorMessage(error: string, description?: string | null): string {
  const list = PERMISSIONS.map((p) => `${p.name}: ${p.why}`).join(" ");
  if (error === "access_denied") return `Consent was declined. DockCrate by BufferSol needs all three application permissions to work. ${list}`;
  return `Microsoft returned "${error}"${description ? `: ${description.slice(0, 200)}` : ""}. A Global Administrator or Privileged Role Administrator must grant consent. Permissions requested: ${PERMISSIONS.map((p) => p.name).join(", ")}.`;
}

export interface ConsentResult {
  ok: boolean;
  status: TenantStatus | null;
  tenantId: string | null;
  message: string | null;
  /** Set when the caller must send the browser through Entra to prove the sign-in is an admin of the tenant. */
  proofUrl?: string;
}

/** Verifies the connection by an app-only call. Sets connected (within seconds of consent) or keeps waiting with the reason. */
export async function verifyTenant(deps: Deps, t: Tenant): Promise<Tenant> {
  if (!t.entraTenantId) return t;
  try {
    const org = await deps.graph.forTenant(t.entraTenantId).getOrganization();
    const next = await save(deps, t, { status: "connected", lastError: null, connectedAt: t.connectedAt ?? deps.now().toISOString(), name: t.name || org.displayName });
    if (t.status !== "connected") await audit({ orgId: t.orgId, actorId: null, action: "tenant.connected", target: t.id, meta: { tenantId: t.id } });
    return next;
  } catch (e) {
    if (e instanceof GraphConsentError)
      return save(deps, t, { status: t.status === "connected" || t.status === "disconnected" ? "disconnected" : "waiting_consent", lastError: t.status === "waiting_consent" || t.status === "pending" ? "Consent is not visible to Graph yet." : "Consent was revoked." });
    // A transient failure never disconnects a tenant that was connected.
    return save(deps, t, { lastError: "Could not reach Graph yet.", status: t.status });
  }
}

/** GET /api/tenants/consent/callback. The caller redirects to the dashboard with `message`. */
export async function handleConsentCallback(
  deps: Deps,
  p: { state?: string | null; tenant?: string | null; admin_consent?: string | null; error?: string | null; error_description?: string | null },
): Promise<ConsentResult> {
  const st = p.state ? verifyToken<{ t: string; o: string; k: string }>(p.state, deps.now().getTime()) : null;
  if (!st || st.k !== "state") return { ok: false, status: null, tenantId: null, message: "The consent link expired or is not valid. Start again from the dashboard." };
  const tenant = await deps.db.collection<Tenant>("tenants").get(st.t);
  if (!tenant || tenant.orgId !== st.o) return { ok: false, status: null, tenantId: null, message: "That tenant no longer exists." };
  if (p.error) {
    const message = consentErrorMessage(p.error, p.error_description);
    await save(deps, tenant, { status: tenant.status === "connected" ? "connected" : "waiting_consent", lastError: message });
    return { ok: false, status: "waiting_consent", tenantId: tenant.id, message };
  }
  const entra = p.tenant?.toLowerCase() ?? "";
  if (!/^[0-9a-f-]{36}$/.test(entra) || entra === PERSONAL_MSA_TENANT || String(p.admin_consent).toLowerCase() !== "true")
    return { ok: false, status: tenant.status, tenantId: tenant.id, message: "Microsoft did not return a work or school tenant with admin consent." };
  const refused = await checkBind(deps, tenant, entra);
  if (refused) return refused;
  if (deps.requireConsentProof && tenant.entraTenantId !== entra) {
    // The redirect proves nothing: a signed-in admin of that very tenant must come back through Entra first (REVIEW P1-1).
    const nonce = newNonce();
    const state = signToken({ t: tenant.id, o: tenant.orgId, k: "proof", e: entra, n: nonce }, STATE_TTL, deps.now().getTime());
    await save(deps, tenant, { lastError: null });
    return { ok: false, status: tenant.status, tenantId: tenant.id, message: null, proofUrl: buildProofUrl({ baseUrl: deps.baseUrl, tenant: entra, state, nonce }) };
  }
  return bindTenant(deps, tenant, entra);
}

/**
 * Microsoft's consent redirect is not signed: anyone holding a valid state for their own row can put any tenant id in the URL,
 * and Graph would answer for any tenant that ever consented to our app. So a row never changes Microsoft tenant, and
 * one Microsoft tenant belongs to one DockCrate organization (rows are never deleted, so the claim persists).
 */
async function checkBind(deps: Deps, tenant: Tenant, entra: string): Promise<ConsentResult | null> {
  if (tenant.entraTenantId && tenant.entraTenantId !== entra)
    return { ok: false, status: tenant.status, tenantId: tenant.id, message: "This entry is already linked to a different Microsoft tenant. Add a new tenant to connect another one." };
  const others = (await deps.db.collection<Tenant>("tenants").find({ entraTenantId: entra })).filter((x) => x.id !== tenant.id);
  const dupe = others.find((x) => x.orgId === tenant.orgId);
  if (dupe) return { ok: false, status: tenant.status, tenantId: tenant.id, message: `That Microsoft tenant is already connected as "${dupe.name}".` };
  const owner = others[0];
  if (owner) {
    await audit({ orgId: tenant.orgId, actorId: null, action: "tenant.consent_conflict", target: tenant.id, meta: { tenantId: tenant.id } });
    await raiseAlert(deps, { orgId: owner.orgId, tenantId: owner.id, severity: "critical", kind: "tenant.claim_attempt", dedupeKey: `claim:${owner.id}:${tenant.orgId}`,
      message: `Another DockCrate organization tried to connect ${owner.name}. It was refused. If you did not expect this, review the enterprise app consent in Microsoft Entra.` });
    return { ok: false, status: tenant.status, tenantId: tenant.id, message: "That Microsoft tenant is already connected to another DockCrate organization. Contact support if you manage it." };
  }
  return null;
}

async function bindTenant(deps: Deps, tenant: Tenant, entra: string): Promise<ConsentResult> {
  const waiting = await save(deps, tenant, { entraTenantId: entra, status: "waiting_consent", lastError: null });
  const done = await verifyTenant(deps, waiting);
  return { ok: done.status === "connected", status: done.status, tenantId: done.id, message: done.status === "connected" ? null : "Consent received. Waiting for Microsoft to finish propagating it; this page updates on its own." };
}

const PROOF_REASON: Record<string, string> = {
  not_admin: "The account you signed in with is not an administrator of that Microsoft tenant (Global, Privileged Role, Application or Cloud Application Administrator).",
  tenant_mismatch: "You signed in to a different Microsoft tenant than the one being connected.",
  expired: "The sign in took too long. Start again from the dashboard.",
};

/** POST /api/tenants/consent/proof (Entra's form_post). Links the tenant only when the id_token's `tid` equals the tenant being linked and its holder is an admin. */
export async function handleConsentProof(deps: Deps, p: { state?: string | null; id_token?: string | null; error?: string | null; error_description?: string | null }): Promise<ConsentResult> {
  const st = p.state ? verifyToken<{ t: string; o: string; k: string; e: string; n: string }>(p.state, deps.now().getTime()) : null;
  if (!st || st.k !== "proof") return { ok: false, status: null, tenantId: null, message: "The sign in expired or is not valid. Start again from the dashboard." };
  const tenant = await deps.db.collection<Tenant>("tenants").get(st.t);
  if (!tenant || tenant.orgId !== st.o) return { ok: false, status: null, tenantId: null, message: "That tenant no longer exists." };
  if (p.error) return { ok: false, status: tenant.status, tenantId: tenant.id, message: `Microsoft sign in failed: ${(p.error_description ?? p.error).slice(0, 200)}` };
  const refused = await checkBind(deps, tenant, st.e);
  if (refused) return refused;
  const proof = await verifyAdminIdToken(p.id_token, { tenant: st.e, clientId: entraClientId() ?? "", nonce: st.n, now: deps.now().getTime(), fetchImpl: deps.fetch });
  if (!proof.ok) {
    await audit({ orgId: tenant.orgId, actorId: null, action: "tenant.consent_proof_failed", target: tenant.id, meta: { tenantId: tenant.id, reason: proof.reason } });
    return { ok: false, status: tenant.status, tenantId: tenant.id, message: PROOF_REASON[proof.reason] ?? "Microsoft did not confirm that you administer that tenant." };
  }
  await audit({ orgId: tenant.orgId, actorId: null, action: "tenant.consent_proof_ok", target: tenant.id, meta: { tenantId: tenant.id } });
  return bindTenant(deps, tenant, st.e);
}

/** Signed, expiring link an IT admin opens without a DockCrate account. Consent itself authenticates them. */
export function createConsentLink(deps: Deps, t: Tenant, now = deps.now().getTime()): string {
  return `${deps.baseUrl}/connect/consent/${signToken({ t: t.id, o: t.orgId, k: "link" }, LINK_TTL, now)}`;
}

/** Resolves a link token to the consent URL, or null when invalid or expired. */
export function consentUrlForLink(deps: Deps, token: string): string | null {
  const p = verifyToken<{ t: string; o: string; k: string }>(token, deps.now().getTime());
  if (!p || p.k !== "link") return null;
  return buildConsentUrl({ baseUrl: deps.baseUrl, orgId: p.o, tenantId: p.t, now: deps.now().getTime() });
}

/** "Send consent link to admin": emails the link through the Mailer and shows Waiting for admin. */
export async function sendConsentLink(deps: Deps, t: Tenant, adminEmail: string, actorId: string | null): Promise<Tenant> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new HttpError(400, "invalid_email");
  const url = createConsentLink(deps, t);
  const mail = noticeEmail({
    title: `Connect ${t.name} to DockCrate by BufferSol`,
    body: `A colleague asked you to approve DockCrate by BufferSol for the Microsoft tenant "${t.name}". It publishes Win32 apps to Intune and reads install results. Permissions: ${PERMISSIONS.map((p) => p.name).join(", ")}. The link works for 7 days. You sign in with your own admin account on Microsoft's page.`,
    actionUrl: url,
    actionLabel: "Review and approve",
  });
  await deps.sendMail({ to: adminEmail, ...mail, category: "transactional" });
  const next = await save(deps, t, { status: t.status === "connected" ? "connected" : "waiting_consent", consentSentTo: adminEmail.toLowerCase() });
  await audit({ orgId: t.orgId, actorId, action: "tenant.consent_link_sent", target: t.id, meta: { tenantId: t.id } });
  return next;
}

/** Cron `tenant-verify`: retries tenants waiting for consent propagation, and probes connected ones for lost consent. */
export async function tenantVerifyJob(deps: Deps): Promise<{ checked: number; connected: number; disconnected: number }> {
  const all = await deps.db.collection<Tenant>("tenants").find();
  let connected = 0, disconnected = 0, checked = 0;
  for (const t of all) {
    if (!t.entraTenantId || t.status === "pending") continue;
    checked++;
    const wasConnected = t.status === "connected";
    const next = await verifyTenant(deps, t);
    if (next.status === "connected") connected++;
    if (wasConnected && next.status === "disconnected") {
      disconnected++;
      await raiseAlert(deps, { orgId: t.orgId, tenantId: t.id, severity: "critical", kind: "tenant.disconnected", message: `${t.name}: consent was revoked or is no longer valid. Jobs for this tenant are stopped.` });
      await audit({ orgId: t.orgId, actorId: null, action: "tenant.disconnected", target: t.id, meta: { tenantId: t.id } });
    }
  }
  return { checked, connected, disconnected };
}
