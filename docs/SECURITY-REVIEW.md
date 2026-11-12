# DockCrate adversarial security review (12 Nov 2026)

Independent review run from the attacker's chair: a signed-in customer who wants another customer's data, paid features for free, or code execution. Every finding below was first reproduced against the locally running production build (`next start`, memory DB, e-mail outbox) or with a failing unit test, then fixed at the root cause and re-run green. Not deployed.

Regression tests: `tests/e2e/qa/attacker.spec.ts` (9 request based exploits, two users in two organisations, no browser needed) and `tests/unit/security-review.test.ts`.

## Threat model

**Assets**
- Customer Microsoft tenants: the Intune write access DockCrate gets through admin consent (publishing a Win32 app = code execution on every managed device). This is the crown jewel.
- Organisation data: tenants, ring configs, deployments, App Sets, audit log (with member IPs), alert prefs, webhook endpoints and their signing secrets, API keys.
- Accounts and sessions (Better Auth cookies, magic links, passkeys, TOTP).
- Billing state: Stripe customer, entitlement, plan limits (devices, tenants, apps).
- Founder data: early-access leads, `/admin`.
- Server side reach: the app's own network position (SSRF), cron and Stripe secrets.

**Actors**
- Anonymous visitor (marketing pages, sign-in, early access form, public catalog, Stripe webhook URL).
- Signed-in user of another organisation (the main attacker here).
- Member of the same organisation with a lower role (viewer, operator) or a limited tenant scope (MSP technician).
- Removed member, ex-employee with an old link or API key.
- A party that controls a URL the app calls (webhook receiver, DNS).

**Entry points**
- 45 route handlers under `src/app/api` (all cookie routes wrapped in `withApi`: same-origin check, error masking).
- Better Auth under `/api/auth/*`: magic link, organisation plugin (invite, accept, roles, set-active), API key plugin, passkey, TOTP, delete user.
- Server pages under `/app/*` and `/admin/*` (proxy cookie gate, real checks in `requireOrg` / `isFounderAdmin`).
- `?next` and `callbackURL` redirect parameters.
- Outbound calls: customer webhooks (user supplied URL), Stripe, Resend, Microsoft Graph, installer downloads (already limited by REVIEW P1-4).
- Inbound signed calls: Stripe webhook, cron (`CRON_SECRET`), consent callback (signed state), unsubscribe (HMAC token).
- Exports: account JSON export, audit CSV, dock CSV, leads CSV.

## Findings (most severe first)

| ID | Severity | Status |
|---|---|---|
| S-2 | High | Fixed |
| S-4 | High | Fixed |
| S-1 | Medium | Fixed |
| S-3 | Medium | Fixed |
| S-6 | Low | Fixed |
| S-7 | Low | Fixed |
| S-5 | Low (functional, permission model) | Fixed |

### S-2 (High, fixed) SSRF through customer webhook URLs
- **Attack:** `isSafeWebhookUrl` only compared the literal host text. `https://localhost./h` (trailing dot) was accepted (reproduced: 201), as was any public name whose DNS answer is `127.0.0.1`, `169.254.169.254` or a private range (for example a wildcard DNS service or a rebinding domain). Single-label hosts, CGNAT `100.64/10`, `198.18/15` and IPv4-mapped IPv6 were not covered. Deliveries never rechecked the address, so a URL saved while it pointed at a public IP could be re-pointed later. "Send test" then makes the server POST signed JSON to the internal address and shows the status code, an internal port scanner and metadata endpoint probe.
- **Fix:** `src/lib/security/ssrf.ts`. Save-time check: https only (http only outside production), no credentials in the URL, trailing dots stripped, internal suffixes (`.localhost .local .internal .lan .corp .home.arpa .localdomain`) and single-label names refused, and every IP literal checked against the full private, loopback, link-local, CGNAT, documentation, multicast and reserved IPv4 and IPv6 list. Delivery-time check: real deliveries go through `pinnedPost`, a `node:https` request whose socket `lookup` refuses any private answer. Check and connect use the same DNS answer, so DNS rebinding cannot slip between them. No redirects are followed, the response body is discarded after the status line (no huge or slow body can hold a worker), and there is a 10 s cap. Blocked deliveries are logged as `blocked_address`.
- **Tests:** e2e "SSRF: webhook URLs ...", unit `S-2` (rebinding answer, loopback server behind a hostname gets zero hits, stored unsafe endpoint never called).

### S-4 (High, fixed) Data export bypassed roles and tenant scope
- **Attack:** `GET /api/account/export` returned, for every organisation the caller belongs to, the full audit log (every member's IP address and every tenant's entries), the Stripe billing account and the webhook endpoints. A **viewer** (no `audit:read` in the app) or a tenant-scoped technician could read what their role hides. Reproduced: a viewer's export contained the owner's audit row with IP.
- **Fix:** `src/lib/account-export.ts` `scopeOrgExport` applies the same permissions the app uses: audit rows only with `audit:read` and only tenants in scope, entitlement only with `billing:read`, billing account only with `billing:manage`, webhook endpoints only with `webhook:read`. The export also states the caller's role per organisation.
- **Tests:** e2e "data export: a viewer gets only ...", unit `S-4`.

### S-1 (Medium, fixed) Open redirect through control characters in `?next`
- **Attack:** `safeNext` refused `//host` and backslashes but not tab, CR or LF. Browsers strip those inside URLs, so `/sign-in?next=/%09/evil.example` answered `Location: /\t/evil.example` and the browser went to `//evil.example`. This was reproduced against the running app. It also applied to the sign-in form's client redirect, the two-factor form and onboarding. That is a clean phishing chain from a link on our own domain.
- **Fix:** `safeNext` refuses any control character, space or C1 character and also requires the path to resolve to our own origin. Better Auth's own `callbackURL` check was confirmed to refuse off-site values (403).
- **Tests:** e2e "open redirect ..." and "magic link callbackURL ...", unit `S-1`.

### S-3 (Medium, fixed) Magic link mail bombing
- **Attack:** the only limit on `/api/auth/sign-in/magic-link` was Better Auth's per-IP limit. `RULES.authEmail` and `RULES.authIp` existed but nothing used them. Eight requests for one victim address from eight IPs all returned 200 and sent eight mails. Magic link is the live sign-in method while Entra is not configured (early access). That makes it a free mail cannon at any inbox, and it burns our Resend reputation.
- **Fix:** a Better Auth `before` hook (`signInMailBrake` in `src/lib/auth/index.ts`): at most 5 links per address and 20 per IP per 10 minutes, answered with 429 whether or not the account exists (no enumeration).
- **Tests:** e2e "magic link mail bombing ...", unit `S-3`.

### S-6 (Low, fixed) Outbound calls without a brake
- **Attack:** `POST /api/webhooks/:id/test` and `GET /api/billing/entitlement?refresh=1` use `requireOrg` rather than `apiCtx`, so they skipped the per-user limit. Each call costs one outbound request: a POST to any public URL, which turns the app into a request reflector, or a Stripe API call, which eats the Stripe rate limit shared by all customers.
- **Fix:** `RULES.outbound` (10 per minute per organisation). Test pings answer 429 over the cap. An entitlement refresh over the cap serves the stored entitlement.

### S-7 (Low, fixed) CSV formula injection bypasses
- **Attack:** `csvCell` neutralised `= + - @` only at position 0. A leading space (` =HYPERLINK(...)`), full-width `＝`, `|` (DDE) or `%` slipped through in the audit, dock and leads exports. Org names, tenant names and early-access company names are attacker-controlled.
- **Fix:** leading blanks, full-width variants, `|` and `%` are also prefixed with an apostrophe. Unit `S-7`.

### S-5 (Low, functional, fixed) Organisation API key permissions did not match the plugin
- The Better Auth API key plugin checks `apiKey: create | update | delete | read` for organisation keys. Our roles only granted `read` and `manage`, so only the org creator (implicit all permissions) could create or revoke keys. Admins got 403 (reproduced), and a key could not be revoked by anyone but the creator. This was not exploitable, but it meant a leaked key could only be revoked by one person. Owners and admins now hold all four actions. Operators and viewers still cannot create or delete keys (e2e "API keys ...").

## Attempted and held (no change needed)
- **Tenant isolation / IDOR:** organisation B tried 20 reads, writes and deletes with organisation A's ids: tenants, groups, tenant export, consent link, rings, tenant-apps, deployments, webhook update, delete and test, member scope get and put, Better Auth get-full-organization, set-active, invite into A, update A, delete A, API key create and list for A, list invitations. All refused, and the lists stay empty. Every app route loads the row and compares `orgId`, and tenant routes also check member scope (`authorize`). Real-tenant rows cannot be created in stub mode (no Entra app), so tenant-row IDOR is covered by the existing unit tests (`review.test.ts`, `p1.test.ts`).
- **Privilege escalation:** an invited admin cannot promote themselves to owner, demote or remove the owner, or invite an owner. A stranger cannot accept an invitation addressed to someone else. Billing checkout is owner only.
- **Sessions:** magic links are single use (a replay in a fresh client gets an error redirect and no cookie). Sign-out kills the stolen cookie. Cookies are HttpOnly and SameSite=Lax, and in production `__Host-` + Secure.
- **CSRF:** every cookie route goes through `withApi` (Origin or Referer must be ours). Requests carrying `Authorization: Bearer` or `x-api-key` skip the check, but a cross-site browser request cannot set those headers without a CORS preflight, which we never allow. The only GET with a side effect, unsubscribe, is HMAC signed.
- **NoSQL injection:** every body is parsed by zod, ids are path strings, and no filter is built from a raw object (`{"email":{"$ne":1}}` gets a validation error). No `$where` or `$regex`, and no user input reaches `new RegExp`.
- **HTML injection:** e-mail templates escape every interpolated value. The only `dangerouslySetInnerHTML` is JSON-LD with `<` escaped.
- **Billing tampering:** checkout takes only a plan id and interval from the client. Prices come from Stripe lookup keys on the server, and limits are enforced server-side at tenant create, publish and App Set runs. Stripe webhook signature, replay, out-of-order and duplicate handling were already covered (`launch-hardening.test.ts`, `hardening.test.ts`).
- **Founder pages and cron:** `/admin` and `/api/admin/*` answer 404 to non-founders. Cron needs `CRON_SECRET` with a constant-time compare. Dev routes are 404 unless `E2E_OUTBOX=1`.
- **Exposure:** `/api/health` reports booleans only. API errors are `{error: code}` with no stack. No browser source maps. `x-powered-by` is off. The built-bundle secret scan (H-5) still passes.
- **Headers:** CSP, HSTS (preload), nosniff, frame DENY, `frame-ancestors 'none'`, COOP, Referrer-Policy and Permissions-Policy are all present. The whole Playwright suite (87 tests, including the click-every-button and crawl specs that fail on any CSP violation) passed against the fixed build.
- **Dependencies:** `fflate` 0.8.2 → 0.8.3 (GHSA-px8p-9vwx-vf98, an infinite loop in `unzipSync`; we only zip, but the patch is free). `npm audit --omit=dev` reports 0. One moderate advisory remains in dev-only lint tooling (minimatch under typescript-eslint). The only offered fix is a breaking downgrade of `eslint-config-next`, so it was not applied; it never ships.

## Needs a product decision (recommendations)
1. **`script-src 'unsafe-inline'`.** Marketing pages are static, so per-request nonces would make them dynamic. Recommendation: move to nonce-based CSP (`strict-dynamic`) for `/app/*` first, where the pages are already dynamic, and keep the static marketing pages as they are.
2. **Client IP trust.** `clientIp()` and the sign-in brake use the first `x-forwarded-for` hop. That is correct on Vercel, which sets the header itself. Behind any other proxy or on a VPS it is spoofable, and the per-IP limits become per-request. Recommendation: when the always-on parts move to a VPS, read the IP from the proxy's own header and drop client-supplied ones at the edge. The per-address limit (S-3) holds either way.
3. **API keys outlive their creator's membership.** Organisation keys belong to the organisation, so a removed admin's key keeps working. `/api/v1` only exposes `/me` today, so the impact is nil. Recommendation: before more `/api/v1` endpoints ship, revoke keys created by a member when that member is removed, or show the creator next to each key.
4. **Account deletion by a sole owner deletes the organisation even when other members exist.** Recommendation: require ownership transfer first when the organisation has other members.
5. **Unbounded App Set count per organisation** (each set is capped at 50 apps). Recommendation: a cap of 200 sets, in line with the 20-webhook cap.
6. **Sign-in has no ALTCHA.** S-3 caps the damage. Recommendation: add the existing ALTCHA widget to the magic link form if abuse shows up in the logs.
