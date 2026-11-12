# DockCrate pre-launch review (M5, 5 Nov 2026)

Reviewer: Opus, reading the code rather than the summaries in PROGRESS. Scope: what ships to devices, tenant isolation and authorisation, security, billing, public claims, accessibility and ops. All P0s below are **fixed in this change**, each with a regression test in `tests/unit/review.test.ts` that failed before the fix (checked by stashing `src/` and running the file: 12 of 12 failed) and passes now.

Line numbers refer to the code after this change.

## P0: must fix before launch (all fixed)

### P0-1 Account takeover through Entra's unverified `email` claim (nOAuth)
- **Where:** `src/lib/auth/index.ts:101` (was `accountLinking: { enabled: true, trustedProviders: ["microsoft"] }`).
- **Failure:** Better Auth links a new OAuth identity to an existing user when the provider is "trusted", even if the email is not verified (`better-auth/dist/oauth2/link-account.mjs:171`). In a multi-tenant Entra app, the `email` claim is set by each tenant's admins. An attacker creates a user in their own free tenant with `mail = owner@victim-msp.com`, signs in to DockCrate, gets linked to the victim's user, and then holds the owner role over every connected Intune tenant.
- **Fix:** `ACCOUNT_LINKING = { enabled: false, trustedProviders: [] }` (line 60). A user is their Microsoft account. A second Microsoft account with the same email is refused, not merged. Invitations still need the invitation id from the invitee's mailbox (Better Auth default with opaque ids).
- **Test:** `P0-1 sign in`.

### P0-2 A forged consent callback gives another organization control of a tenant
- **Where:** `src/lib/tenants/index.ts:137-156` (`handleConsentCallback`).
- **Failure:** Microsoft's admin consent redirect is not signed. Any signed-in user has a valid `state` for their own tenant row, so they can call `/api/tenants/consent/callback?state=<theirs>&tenant=<victim tid>&admin_consent=True`. Tenant ids are public: every domain's `openid-configuration` returns one. The app-only Graph probe then succeeds for every tenant that ever consented to our multi-tenant app. The row turned "connected" and the attacker's org could list the victim's groups, read install data and publish apps to the victim's devices. The duplicate check was per org only. A connected row could also be silently moved to a different Microsoft tenant, and its ring groups and deployments would then point at the wrong tenant. Our own screenshot scripts (`scripts/screenshots-m3.ts:30`) forge exactly this URL.
- **Fix:**
  - A row never changes its Microsoft tenant.
  - One Microsoft tenant belongs to one DockCrate organization. Tenant rows are never deleted, so the claim persists.
  - A cross-org attempt is refused and audited (`tenant.consent_conflict`), and the owning org gets a critical `tenant.claim_attempt` alert.
  - A per-IP rate limit is on the callback route.
  - The remaining gap is listed as P1-1.
- **Tests:** `P0-2 consent callback` (cross-org claim, rebinding).

### P0-3 Rollback could put a Pilot-only or held version on Broad
- **Where:** `src/lib/rings/engine.ts:115-140` (`rollback`).
- **Failure:** Rollback re-assigned the target to every group the current version had reached, with no gate:
  - **VM pending:** say N was VM pending (Pilot only, D-01), N+1 passed 4/4 and reached Broad. One click put N as Required on the whole Broad group without its VM check.
  - **Held or revoked:** a target that had since been held or revoked (scan hit found later, signer revoked) was re-assigned as well.
  - **Lost Broad:** the target's own Broad assignment was replaced by the Pilot-only list, so Broad lost it.
- **Fix:**
  - The target goes through `publishPlan`. Held, revoked or missing is refused with `rollback_target_blocked`.
  - A version with no Broad permission is refused when Broad must be restored.
  - The target keeps the groups it still has.
  - The current version's stored assignments become the Uninstall list.
- **Tests:** `P0-3 rollback` (VM pending onto Broad, held target). The existing rollback test was updated: N now keeps Broad.

### P0-4 Two versions of an app Required on the same group, and old versions promoted later
- **Where:** `src/lib/publish/win32.ts:125-128` and `153-167`, `src/lib/rings/engine.ts:88`.
- **Failure:** Publishing N+1 never touched N. N stayed Required on Pilot and Broad next to N+1. MSI detection is product code plus `productVersionOperator: "equal"` (`src/lib/graph/real.ts:32`), and a major upgrade changes the product code. Once N+1 was installed, N's detection failed and Intune reinstalled or downgraded N on every device, in a loop. Separately, an N still in Pilot when N+1 arrived was promoted to Broad by `ringTick` 48 h later, after the customer had moved on.
- **Fix:** `retireOlder()` runs as follows:
  - When N+1 is assigned to Pilot, it removes the Pilot group from every earlier live deployment of the app in that tenant.
  - When N+1 is promoted, it removes the Broad group the same way.
  - A deployment left with no assignment becomes `superseded`. The tick ignores it, and it stays a rollback target.
  - Each change is audited as `deployment.superseded`.
  - The step is idempotent, so a resumed upload repeats it safely.
- **Tests:** `P0-4 a new version retires the old one per ring` (2 tests).

### P0-5 Concurrent publish calls create duplicate Intune apps
- **Where:** `src/lib/publish/win32.ts:197-214`.
- **Failure:** A double click, or an App Set run overlapping the nightly fan-out, could make two calls resume the same deployment at step `create_app`. Each call ran `createWin32App`, giving two "DC | App x.y" apps in the customer's tenant (one orphaned, both assignable). On a first publish, the memory driver also allowed two deployment rows.
- **Fix:**
  - **Lease:** a 5-minute lease (`leaseUntil` holding a time plus a token) is written before any Graph call and read back. A live lease returns 409 `publish_in_progress`.
  - **First publish race:** a newcomer that finds another row with the same key deletes its own row and backs off. Mongo's unique index on `{tenantId, idempotencyKey}` already blocks the second insert.
  - **Expiry:** the lease is cleared on success and on error. It expires on its own after a function timeout.
- **Tests:** `P0-5 one publish at a time` (parallel calls, a live lease, and resume after expiry).

### P0-6 Public claims the code does not back (fixed in content)
- **Failures:** The meta description (`src/config/product.ts:56`), the landing subtitle (`src/app/(marketing)/page.tsx:106`) and the legal security page (`src/content/legal/security.ts:49`) said every version is malware-scanned and test-installed in a clean VM. In fact there is no real scanner or VM lab yet (fakes only, D-30), and VM-pending versions do reach Pilot devices. Other false claims:
  - The docs named "ClamAV and Microsoft Defender, plus YARA" (`src/content/docs/how-a-version-is-checked.ts:25`).
  - The security page said "two engines" (`src/content/security.ts:35`).
  - Starter sold "Rings, rollback and macOS" as one line.
  - "Scheduled windows" (Professional) had no Roadmap tag.
  - The sub-processor list hid the email provider.
- **Fix:**
  - The wording now states the gate, which is true in code: nothing publishes until hash, signer and scan pass, and VM pending means Pilot only.
  - The scanner is described as being commissioned.
  - macOS is its own line with the Roadmap tag, and "Scheduled windows" now gets the tag too (`src/components/marketing/pricing-table.tsx:33`).
  - The sub-processors now name Resend and add Cloudflare. The DPA annex and the sub-processors page read the same list (D-37).
- **Check:** unit test D-37 (lists stay identical) and e2e.

## P1: should fix before or shortly after launch

| # | Where | Failure | Fix | Status |
|---|---|---|---|---|
| P1-1 | `src/lib/tenants/index.ts:137` | The consent redirect still is not proof. A Microsoft tenant that consented to DockCrate but is bound to **no** org (for example, the callback never arrived) can be claimed by whoever forges the callback first. | Binding now needs an Entra sign in: the callback only redirects to `login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` (id_token, form_post, signed state with a nonce). `POST /api/tenants/consent/proof` verifies the RS256 signature against that tenant's keys, `tid` equals the tenant being linked, `iss`, `aud`, `nonce`, expiry, and an admin role in `wids`. Code: `src/lib/tenants/proof.ts`, `handleConsentProof`. Needs MANUAL_STEPS 1b.| **Fixed** (6 Nov 2026) |
| P1-2 | `src/lib/publish/win32.ts:205` | The lease is read-after-write, not atomic (`Collection` has no compare-and-set). Two resumes within a few ms can still both pass. | `Collection.insertIfAbsent` and `Collection.claim` (Mongo `insertOne` duplicate key and `findOneAndUpdate` with the expected lease value). The deployment id is derived from the idempotency key, so the first insert is the guard; a resume claims the exact lease value it read.| **Fixed** (6 Nov 2026) |
| P1-3 | `src/lib/publish/win32.ts:73` | A crash after `createWin32App` but before its id is saved leaves an orphan Intune app, and the next attempt creates another. | `createStartedAt` is stored before `createWin32App`; `GraphClient.findAppsByName`; a retry adopts an unrecorded app, and the `publish-reconcile` cron (every 10 min) adopts, finishes, deletes duplicates, or abandons uploads older than 24 h (`src/lib/publish/reconcile.ts`). The id cannot be stored in the same instant as the Graph call, so the marker plus lookup closes the window.| **Fixed** (6 Nov 2026) |
| P1-4 | `src/lib/publish/installer.ts:28` | The vendor download has no size cap and no timeout, and follows redirects to any host. The hash check stops tampering, but not filling `/tmp` or holding the 60 s function. | `UrlInstallerSource` limits: HTTPS only, 400 MB cap (header and counted), 45 s timeout over headers and body, manual redirects that stay on the same host (max 3). Temp dir removed on failure. The reviewed-host allow list stays with the real downloader (P1-5).| **Fixed** (6 Nov 2026) |
| P1-5 | Launch gate | No real winget, downloader, scanner or VM adapter exists (D-30). In real mode `UrlInstallerSource` needs an `installerUrl`, which only the real pipeline sets. **At launch, no catalog version can be published to a real tenant.** The seed's check results are asserted data, labelled "Demo data". The real upload is also unproven (D-24, MANUAL_STEPS 5). | Build the Sandbox pipeline (VPS phase), run the real tenant spike, and keep paid sign-up off (`payments_enabled`) until a real version has shipped end to end. | **Open** (10 Nov 2026 check): not code. Needs a VPS Sandbox pipeline and the real tenant spike, both owner/external. Paid sign-up stays off until done (MANUAL_STEPS 11) |
| P1-6 | `src/app/api/audit/route.ts`, `src/app/app/settings/audit/page.tsx` | Operators and viewers limited to some tenants could read audit entries about every tenant in the org. | `auditVisible()` (`src/lib/authz.ts`) filters by `meta.tenantId`. | **Fixed** |
| P1-7 | `src/lib/publish/win32.ts:175` | The org-wide pause stopped ticks and fan-out but not a manual publish (the tenant pause did). | Manual publish now returns 409 `org_paused`. | **Fixed** |
| P1-8 | `src/lib/rings/engine.ts:158` | Auto-update fan-out skipped `assertCanPublish`, so the device grace and plan limits did not stop automatic publishing. | `assertCanPublish` is called per tenant. | **Fixed** |
| P1-9 | `src/lib/catalog/verify.ts:66` | An unsigned installer (empty thumbprint) passed the signer check on a first version. | An empty thumbprint now fails the signer check and holds the version. | **Fixed** |
| P1-10 | `src/app/api/health/route.ts` | Always returned `ok: true`, even when Mongo was down. | A DB read with a 3 s timeout; 503 when it fails. | **Fixed** |
| P1-11 | `vercel.json` | `tenant-verify` was not scheduled, so tenants stuck in "waiting for consent" never recovered and revoked consent went unnoticed until a ring tick. | Scheduled every 15 minutes (needs Pro, like `rings-tick`). | **Fixed** |
| P1-12 | `src/lib/alerts` (D-32) | Members who never opened the app get no alert email. | Better Auth organization hooks (`afterCreateOrganization`, `afterAddMember`, `afterAcceptInvitation`, `afterUpdateMemberRole`) write the preference row via `ensureMemberPrefs`. Existing members: run `scripts/backfill-alert-prefs.ts` once (MANUAL_STEPS 4c).| **Fixed** (6 Nov 2026) |
| P1-13 | `docs/MANUAL_STEPS.md` | Several env vars and the `db:indexes` step were undocumented, and `.env.example` still said `postslot`. | MANUAL_STEPS 4c added, `.env.example` fixed. | **Fixed** |
| P1-14 | `src/config/product.ts` legal | `{{jurisdiction}}` and `{{registered address}}` render in the terms, privacy policy and DPA. | Owner supplies them (MANUAL_STEPS 10). | **Open** (10 Nov 2026 check): owner must supply jurisdiction and registered address (MANUAL_STEPS 10). Not fixable in code |

## P2: polish and hardening

- **Exact-version MSI detection:** `src/lib/graph/real.ts:32` uses `equal`. With P0-4 the old app is unassigned, so this no longer loops. Still, consider `greaterThanOrEqual`, plus Graph supersedence (brief: "assignments + supersedence").
- **Signer trust on first use:** the first version's signer is trusted with nothing to compare against. Pin per-publisher thumbprints in the reviewed top-200 list.
- **Dock status label:** `src/lib/rings/view.ts:47` labels "Pilot only" from the catalog's current version, not the deployed version.
- **Rollback options:** rollback may target an earlier version that was itself paused for failures. That is the user's choice, but the dialog should say so.
- **Ring tick cost:** `rings-tick` reads every assigned deployment and its tenant, config and org every minute (N+1 queries). Fine at launch scale; batch it later.
- **Unverified competitor claim:** the compare page quotes Pckgr's "over 1,000 customers in 60 countries" ("by its own count"). Keep the source link and check date in `docs/brief.md`, or drop it.
- **Roadmap items on paid tiers:** the Fleet "99.9% SLA" and the Business and Fleet roadmap items carry the Roadmap tag. Keep it until they ship.
- **Touch target:** the billing interval toggle was 32 px tall. It is now 44 px (`min-h-11`). **Fixed.**
- **Accessibility (second pass done 6 Nov 2026, `tests/unit/a11y.test.ts`, `tests/e2e/a11y.spec.ts`):** contrast is now computed over the real tokens in both themes. It found and fixed: the focus colour (amber 2:1 on light surfaces, now dark amber 5:1), `text-muted` (4.3:1, now 5.3:1), `warning` text (3.7:1, now 5.5:1) and input borders (1.8:1, new `--control-border` at 3.8:1 or better). Also: skip link and focusable `main`, `Field` links hint and error to the control (`aria-describedby`, `aria-invalid`), named lists, per set button names, focus outline kept inside the clipped dock panel, `transition-duration` off under reduced motion, a keyboard walk (every tab stop has an outline) on the dock, tenants and App Sets. Rings has static label checks only (it needs a connected tenant). Lighthouse and axe on a live deploy are still to do. Earlier light pass: Found: global `:focus-visible` outline, a `prefers-reduced-motion` block, the native `<dialog>` confirm with Escape and focus trap, labelled icon buttons (the alert bell is 44 px), `role="alert"` on errors, and e2e checks for no horizontal overflow at 375 px. Not done: a full keyboard walkthrough and contrast measurement on the real tokens. Do them with axe in the Lighthouse task.
- **Audit chain:** the claims match D-35. Deleting the newest entries is undetectable without an external anchor, and the security page says so.
- **Billing (reviewed, no defect found):**
  - The webhook verifies the signature on the raw body.
  - The event id is recorded only after success.
  - Every relevant event triggers a recompute from Stripe.
  - Other apps' customers are ignored.
  - A full refund ends the plan.
  - The plan comes only from Stripe lookup keys, and no client flag grants one.
  - Checkout is owner/admin and rate limited.
- **Pre-existing e2e failures from M4 drift:** a second `<title>` inside the QA pipeline SVG, and the "Sample list" text was renamed. Both are fixed in `tests/e2e/flow.spec.ts`.

## Verified as sound
- **Authorisation:**
  - Every `/api/tenants`, deployments, rings, App Sets, tenant-apps and members route calls `authorize()` with the tenant id, after loading the record by org.
  - Webhooks, billing and audit use `requirePermission`.
  - Cron uses a constant-time secret check.
  - `/api/dev/outbox` returns 404 unless `E2E_OUTBOX=1`.
- **Consent `state`:** HMAC-signed with a 1 h expiry and bound to org plus row. The emailed link is a separate token kind with a 7-day expiry.
- **Revoked consent:** a revoked tenant is disconnected by the tick or by `tenant-verify`, gets a critical alert, and every job skips it.
- **Signed manifest:** checked again right before each upload.
- **Ring promotion gate:** promotion re-reads the version and requires 4/4 (D-01). A held version is never promoted.

## Launch hardening pass (10 Nov 2026)
All P1s fixable in code were already closed; P1-5 and P1-14 stay open because they need the owner or an external system (reasons in the table). New findings, fixed, tests in `tests/unit/launch-hardening.test.ts`:
- **P1-15 (fixed): Resend rejection on "Send consent link" returned 500.** Now 502 `mail_unavailable`, provider text only in the log, tenant status unchanged. Test failed before the fix.
- **P1-16 (fixed): invitation and magic link mail failures threw inside Better Auth** (500 to the inviter or visitor). `safeSend` in `src/lib/auth/index.ts` logs and swallows; the invitation row exists and can be resent. Alert and digest mail already caught errors.
- **Money paths (checked, no defect):** signature on the raw body (400, nothing written); duplicate event ids ignored; every subscription, invoice, checkout and refund event recomputes from Stripe, so out of order delivery converges; a failed run is not recorded and gets a Stripe retry (500); events for other apps' customers are ignored; entitlement comes from the webhook and the read-time expiry, never the success redirect. Unknown events now answer 200 and log `stripe_event_ignored`. Tests added for unknown events and for retry after a failure.

## Usefulness and hardening pass (12 Nov 2026)
Tests: `tests/unit/hardening.test.ts`, `tests/e2e/qa/hardening.spec.ts`.
- **P2 "Ring tick cost" and the rest of the P2 list:** unchanged and still open. Reason: none is a defect at launch scale; they need the real tenant (QA-10) or an owner call (compare-page claim, roadmap tags). Fixing them blind would add untested Graph behaviour.
- **H-1 (fixed): no abuse brake on signed-in APIs.** `apiCtx()` now rate limits every signed-in API call and page load per user (`RULES.api`, 600 per minute).
- **H-2 (fixed): forged Stripe webhook calls were unthrottled.** 400 answers are counted per IP; over 30 a minute returns 429. Stripe's own deliveries never get a 4xx, so they are not counted. Signature, duplicate and out of order handling re-tested.
- **H-3 (fixed): `/api/health` now also reports `deps` (stripe, mail, entra configured, booleans only).** No keys, hosts or error text.
- **H-4 (fixed): log scrubbing matched only keys that end in a secret-like word.** It now matches anywhere in the key (`apiKey`, `stripeSignature`, `userEmail`, `otp`), with `code`, `statusCode` and `errorCode` kept.
- **H-5 (added): built client bundle is scanned for key-shaped strings and server env names** (runs after `npm run build`).
- **H-6 (added): CSP test** pins form-action (Stripe), connect-src, blob workers, framing and objects, and fails if any app form posts natively to a third party (every form submits by fetch, so the CSP's form-action cannot block a button).
- **U-1 (added): dock CSV export** (`GET /api/tenants/:id/export`, "Export CSV" on the dock): org and tenant scoped, formulas neutralised.
- **U-2 (added): "Get to your first published app" checklist** on the dock for a connected tenant until rings are set and one app is published.
- **Not done in this pass, with reason:** keyboard shortcuts and bulk publish (no design for them in the brief, and the connected-tenant UI cannot be driven here, QA-10); import from other tools (no export format of Pckgr or Intune scripts is documented in the brief); real Mongo/slow-DB fault injection (needs Atlas, health already answers 503 after a 3 s timeout).
