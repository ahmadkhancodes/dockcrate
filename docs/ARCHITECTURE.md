# ARCHITECTURE: DockCrate by BufferSol on Vercel + MongoDB Atlas + Stripe + the kit

Scope: every P0 in `docs/brief.md`. Infra now: new Vercel account, MongoDB Atlas (`dockcrate` DB, user `dockcrate-app`), Stripe test mode, Cloudflare R2 (own account). Everything that needs an always-on server or a Windows VM sits behind an interface so it moves to the VPS later. Standing decisions: `docs/factory/BATCH1_PLAN.md`. Decisions made here are logged in `docs/DECISIONS.md`.

## 1. Stack and kit usage
- Next.js (App Router) + TypeScript strict + Tailwind v4 tokens (from DESIGN.md) + Zod + Vitest + Playwright, copied from `postslot@kit-v1` (config, DB interface, billing adapter, mailer, rate limit, audit log, webhooks, cron guard, app shell, marketing sections, QA scripts).
- DB: MongoDB behind the kit's DB interface (memory driver for tests). The workbook's Postgres/Drizzle model is mapped to collections in section 4. TTL fields are `Date`.
- Auth: Better Auth with the Microsoft (Entra) social provider only. See P0-1. Magic link is disabled for sign in (work accounts only); email is used for notifications and invites.
- Billing: Stripe Checkout + Portal + webhook through the kit billing adapter; `metadata.app=dockcrate`, lookup keys `dockcrate_*`.
- Mail: kit `Mailer` interface, provider adapter now, SMTP/Postfix adapter on the VPS later. Suppression list and one click unsubscribe from the kit.
- Observability: structured logger + Vercel logs and Web Analytics now. The workbook's self hosted GlitchTip/Prometheus/Loki move to the VPS later (log sink is an interface `LogSink`). Deviation from "no Sentry/Vercel", logged as decision D-02 (owner chose Vercel).

## 2. What runs where
| Concern | Runs on (now) | Moves to VPS later? |
|---|---|---|
| Web app, API routes, Entra callbacks, Stripe webhook | Vercel functions (Node runtime; Fluid compute) | no |
| Job queue (`job_run`, leases, retries, idempotency keys) | MongoDB, behind `JobQueue` | yes: BullMQ + Valkey adapter |
| Job driver ("tick") | Vercel Cron on Pro (every minute) and a Cloudflare Worker cron fallback calling `/api/cron/tick` with `CRON_SECRET`. Hobby = 1 cron/day, so Pro is required before launch | yes: worker processes |
| Catalog sync from winget-pkgs (every 30 min) | cron job `catalog-sync` in a function | maybe |
| Installer download, hash, packaging (.intunewin) | streamed in a Vercel function for installers up to about 300 MB; **Vercel Sandbox** microVM for larger ones, signer checks and scanning | yes: build worker |
| Signer verification and malware scan | Vercel Sandbox microVM (osslsigncode, msitools, ClamAV with signature refresh; signature age recorded) behind `Scanner` and `SignerVerifier` | yes: lab host (adds Defender) |
| **Windows VM install/detect/uninstall test** | **Not possible on Vercel.** `VmLab` interface; adapter `PendingVmLab` now, `ProxmoxVmLab` on the VPS | **yes** |
| Package storage (encrypted .intunewin copy, manifests, QA logs) | Cloudflare R2 (S3 API) behind `ObjectStore` | no |
| Manifest signing (Ed25519) | `ManifestSigner` interface: env key now (Vercel encrypted env), OpenBao later | yes |
| Graph app-only credential (certificate) | `CredentialSigner` interface: PEM key in Vercel encrypted env now, OpenBao/KMS later | yes |
| Mail | provider adapter now | yes: Postfix/KumoMTA |
| Rate limits, audit log, sessions | MongoDB | no |
| Email, in-app alerts, customer Teams/Slack webhooks | functions | no |

Function limits to design for: request/response body streamed not buffered; `maxDuration` up to the Pro limit; work is chunked into resumable steps with state written to `job_run` after each step (see 3.4) so a timeout resumes instead of restarting.

## 3. Key mechanisms

### 3.1 Entra sign in and tenant connect
- One multi tenant app registration "DockCrate by BufferSol" (see MANUAL_STEPS). It serves two flows:
  1. **Sign in** (delegated, `openid profile email User.Read`) through Better Auth Microsoft provider with authority `https://login.microsoftonline.com/organizations/v2.0`. After the token exchange we read the ID token `tid`; if `tid == 9188040d-6c67-4c5b-b112-36a3c8b1b0b4` (the personal Microsoft account tenant) or `tid` is missing we reject and show "DockCrate by BufferSol needs a work or school account".
  2. **Tenant connect** (admin consent): redirect to `https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=<id>&scope=https://graph.microsoft.com/.default&redirect_uri=<origin>/api/tenants/consent/callback&state=<signed nonce incl. orgId>`. Callback receives `tenant`, `admin_consent=True` or `error`. We store `tenant.entra_tenant_id` and set `status=waiting_consent`, then **verify** by getting an app-only token and calling `GET /v1.0/organization`; success sets `connected` (target under 60 s; the callback does it inline, the `tenant-verify` job retries). Errors map to a message naming the missing permission and why we need it.
- Not a Global Admin: "Send consent link to admin" creates a signed, expiring link (`/connect/consent/[token]`, no login needed to open, consent itself authenticates the admin) and emails it; status `waiting_consent` shown as "Waiting for admin".
- App-only Graph access: client credentials grant per tenant, client assertion JWT (RS256, `x5t#S256` header) signed with our certificate through `CredentialSigner`. Tokens cached in memory per tenant (about 55 min). We never store customer secrets.
- Lost consent: any Graph 401/403 with `AADSTS7000112/700016/65001` or `invalid_client` pattern marks the tenant `disconnected`, stops its jobs, emails the owner (once per 24 h) and raises an in-app alert. `tenant-health` cron probes each connected tenant daily.
- Permissions requested (application): `DeviceManagementApps.ReadWrite.All`, `DeviceManagementManagedDevices.Read.All`, `Group.Read.All`. Delegated: `User.Read`. Note: `subscribedSkus` (needs `Organization.Read.All`) is **not** in the three; the EAM checker is a self-check questionnaire and the licence fit is never read from the tenant. Group creation ("create DC-Pilot/DC-Broad") needs `Group.ReadWrite.All`; MVP offers pick-existing plus step by step instructions, and creating groups is an optional separate consent (second tiny app registration "DockCrate Groups", only if the owner wants it; D-05).

### 3.2 Catalog and verification pipeline (critical path)
Source: public `microsoft/winget-pkgs` manifests (MIT). A curated `catalog/top200.json` (identifier list, owner reviewed) bounds scope. `catalog-sync` (every 30 min):
1. For each identifier fetch the latest version folder through `api.github.com` contents API / `raw.githubusercontent.com` (conditional requests with ETag; a token env `GITHUB_TOKEN_READONLY` is optional but recommended for rate limits). Parse YAML (`yaml` package) installer manifest: `InstallerType` (msi, wix, burn, nullsoft, inno, exe, zip-with-nested, msix), `Installers[].Architecture/InstallerUrl/InstallerSha256/Scope/InstallerSwitches/ProductCode/AppsAndFeaturesEntries`, `Publisher`, `License`.
2. Upsert `catalog_app` and a `catalog_version` with status `candidate`. Installer type unknown or unsupported goes to status `manual` (never a guess).
3. Verification job per candidate (states `candidate → scanning → testing → verified | held | revoked`), each step writes a `qa_run` with a log in R2:
   - **hash**: stream download from the vendor URL, compute SHA-256 while streaming, compare to manifest and to our previous observation. Mismatch = `held`.
   - **signer**: extract Authenticode signer (osslsigncode in Sandbox; MSI via msitools + signature). Compare thumbprint/subject to the last verified version. A new signer holds for manual review.
   - **scan**: ClamAV in Sandbox (signature DB age recorded; older than 24 h blocks publication, tested with EICAR). A second engine (Defender) joins in the lab on the VPS.
   - **vm**: `VmLab.run(installer, installCmd, detection, uninstallCmd)`. See section 6 for the Vercel-phase behaviour.
   - **package**: produce the `.intunewin` content (3.3), store encrypted artifact in R2, record `encryption_info`, sign a manifest (Ed25519) over `{app, version, arch, sha256, signer, detection, commands, artifactSha}`.
4. Manifest signature is verified again immediately before every Intune upload.
5. Detection rule generation: MSI/WiX uses the product code (`win32LobAppProductCodeRule`), EXE installers prefer a file/registry rule from `AppsAndFeaturesEntries` (`DisplayVersion`), else a file version rule on the installed path; the QA run proves the rule (install, detect true, uninstall, detect false) before the version can be `verified`.
- Public catalog search: Atlas Search (or a text index on the free tier) with a small denormalised `catalog_search` collection and ISR for app pages; target under 300 ms server time, cached at the edge.
- The MIT notice for winget-pkgs is rendered on catalog pages.

### 3.3 .intunewin packaging in Node (decision D-03)
Microsoft's IntuneWinAppUtil is a Windows binary: it cannot run on Vercel and its licence says internal use only, never as a hosted tool. We therefore implement the Intune content format ourselves in Node from the public Graph documentation (clean room; no GPL SvRooij code is copied):
1. Build the source set (installer file + optional wrapper script) and zip it (stream, deflate).
2. Encrypt the zip stream with AES-256-CBC (random key and IV), compute HMAC-SHA256 over `IV || ciphertext` with a second random key; the stored file is `HMAC(32) || IV(16) || ciphertext`; compute SHA-256 of that file (`fileDigest`).
3. `fileEncryptionInfo = { encryptionKey, macKey, initializationVector, mac, profileIdentifier: "ProfileVersion1", fileDigest, fileDigestAlgorithm: "SHA256" }`, `size` (unencrypted zip), `sizeEncrypted`.
4. For the Graph upload only the encrypted payload is needed (not the outer Metadata/Detection.xml zip Microsoft's tool wraps it in). If the owner wants downloadable `.intunewin` files for debugging, the outer wrapper is added later.
5. Validation: a unit test round-trips decrypt/verify; the VPS lab compares our output against IntuneWinAppUtil 1.8.x on the same input (decrypts to the same zip) and proves a real Intune accepts it. Until that lab check, **this is the highest technical risk** (R-1 below).
Memory: processing is streamed with `highWaterMark` limits so a 300 MB installer never lives in memory; installers above the inline limit go to a Sandbox.

### 3.4 Publishing Win32 apps through Graph (idempotent, resumable)
Create via `POST /beta` or `/v1.0/deviceAppManagement/mobileApps` with `@odata.type: #microsoft.graph.win32LobApp` (display name with prefix `DC |`, publisher, icon, install/uninstall command, `installExperience`, `detectionRules`, `requirementRule`/`requirementRules`, `returnCodes`, `minimumSupportedWindowsRelease`). The upload state machine writes progress after every step:
`create app (store intune_app_id first) → POST contentVersions → POST files {name,size,sizeEncrypted} → poll until azureStorageUriRequestSuccess → upload blocks to the SAS URI (Put Block, 6 MB blocks, resumable by block list) → Put Block List → POST files/{id}/commit with fileEncryptionInfo → poll commitFileSuccess → PATCH app {committedContentVersion} → assign → supersedence`.
- Expired SAS: request a new one with `renewUpload` and resume from the stored block index.
- Existing app of same name/version: adopt or create alongside (user choice), never duplicate (idempotency key = tenant + catalog_version + variant).
- Assign: `POST /mobileApps/{id}/assign` with `mobileAppAssignments` (group target, intent required/available, `win32LobAppAssignmentSettings`). Supersedence: `POST /mobileApps/{newId}/updateRelationships` with `mobileAppSupersedence` (`supersedenceType: update`) targeting the previous version.
- Variants: `standard`; `update_only` (requirement script returns installed version, so it only applies to devices that have the app); `esp_fixed` (fixed version, not superseding, safe during ESP/Autopilot).
- Reads: install status via `installSummary` and app status overview reports; device counts via `/deviceManagement/managedDevices` (`$select=id,operatingSystem,lastSyncDateTime`, paged) or `managedDeviceOverview`; detected apps via `/deviceManagement/detectedApps`.
- Throttling: honour `Retry-After`, exponential backoff with jitter, per tenant concurrency 3, global token bucket. Contract tests run nightly against a fixture tenant (when one exists) and on every deploy against recorded schemas.
- Prefix: every Intune object we create is named `DC | <app> <version>` (configurable per tenant via `tenant_settings.app_prefix`); cleanup only touches the prefix.

### 3.5 Auto update, rings, rollback
- `ring` per tenant: name, `group_id`, `delay_hours` (Pilot 0, Broad 48), `fail_threshold_pct` (10), `order`.
- Event: a catalog version becomes `verified` → `fanout` job creates one `deployment` per (tenant, app) with auto update on. State machine: `uploading → assigned (Pilot) → promoted (Broad) | paused | rolled_back | retired`.
- `ring-tick` job (every minute): for each assigned Pilot deployment whose delay elapsed and which has enough install data, compute failure % from install status. `< threshold` → assign Broad (and supersede); `>= threshold` → `paused`, alert on two channels. A deployment without any Pilot devices promotes after the delay (documented behaviour). Settings and assignments carry across versions.
- Rollback to any of the last 3 versions: for the affected ring re-assign N as Required, N+1 as Uninstall, write audit entry, mark deployment `rolled_back`. Target under 10 minutes for 3 tenants.
- Pause all: per tenant `tenant_settings.paused` and a global org pause; ticks skip paused scopes.

### 3.6 MSP features, audit, billing, mail
- App Sets: `app_set.items` + ring defaults; apply = fan out jobs per tenant with concurrency 3; per tenant results table; a tenant whose consent is revoked is marked `disconnected` and the run continues.
- Cross dashboard: aggregated read model (`dashboard_snapshot` per org, refreshed by `ring-tick` and on events).
- Audit: append only collection (no update/delete code path, Mongo role for the app has no `update/remove` on it in production where Atlas permits, otherwise enforced in the repository layer and tested), fields actor, ip, ua, tenant, action, target, time, hash chain (`prev_hash`) for tamper evidence; CSV export streams and is filtered by the viewer's tenant scope.
- Billing: plans in `product.ts`; `entitlements` recomputed from Stripe on each webhook. Device meter: nightly `device-count` job (per tenant, stale devices excluded after 90 days without check in) → banners ("108 / 100 devices"), **14 day grace** over limit, payment failure grace 14 days per FR-34 (decision D-04 resolves the workbook's 7 vs 14). Free limits enforced server side: 25 devices, 1 tenant, 15 apps; publishing the 16th app returns a typed error that opens the upgrade dialog. Cancellation: at period end; choice "leave apps in Intune" or "remove apps with our prefix" (a `cleanup` job).
- Alerts: critical alerts go out on email + in app, plus the customer's Teams/Slack incoming webhook when set (kit outbound webhook module for signing/retry).

### 3.7 Security posture
CSP and security headers from the kit; Zod on every route; Origin/CSRF checks; rate limits (Mongo sliding window); per tenant RBAC checked in a single `authorize(user, action, tenantId)` function with tests; secrets only in Vercel env; no customer secrets stored; egress allow list (section 7); OWASP ASVS L2 checklist at M5.

## 4. Data model (MongoDB collections; all documents `createdAt/updatedAt` as `Date`)
Auth collections come from Better Auth (user, session, account, organization, member, invitation). DockCrate additions:
- `organizations_ext {orgId, plan, stripeCustomerId, subscriptionId, status(active|past_due|canceled), graceUntil, limits}`
- `memberships_ext {orgId, userId, role(owner|admin|operator|viewer), tenantScope[] | 'all'}`
- `tenants {orgId, entraTenantId (unique per org), name, status(waiting_consent|connected|disconnected), consentToken, deviceCountWin, deviceCountMac, countedAt, lastError}`
- `tenant_settings {tenantId, appPrefix('DC |'), paused, maintenanceWindow}`
- `rings {tenantId, name, groupId, groupName, delayHours, failThresholdPct, order}`
- `catalog_apps {slug, wingetId, name, publisher, platform, licenseRedistributable, iconUrl, tags}`
- `catalog_versions {appId, version, arch, installerUrl, sha256, signer{thumbprint,subject}, status, installCmd, uninstallCmd, detection[], minOs, returnCodes, installerType, verifiedAt, tier}`
- `qa_runs {versionId, step(hash|signer|scan|install|detect|uninstall|package), result, logKey, signatureAgeHours, startedAt, finishedAt}`
- `package_artifacts {versionId, r2Key, size, sizeEncrypted, encryptionInfo(encrypted at rest), manifestSig}`
- `tenant_apps {tenantId, appId, variant, autoUpdate, intent, ringIds}`
- `deployments {tenantId, appId, versionId, ringId, intuneAppId, state, progress, failurePct, idempotencyKey}`
- `deployment_stats {deploymentId, installed, failed, pending, at}`
- `app_sets {orgId, name, items[{appId,variant,intent}], ringDefaults}` and `app_set_runs {setId, results[{tenantId,status,error}]}`
- `job_runs {type, key(unique), payload, state, attempts, lease, runAfter, traceId, error}`
- `audit_events {orgId, tenantId?, actor, ip, ua, action, target, at, prevHash}`
- `subscriptions`, `stripe_events` (kit); `email_messages`, `email_suppressions` (kit)
- `alerts {orgId, tenantId?, severity, kind, state}`
- `installer_fingerprints {type(msi|nsis|inno|installshield|wixburn|squirrel), match, silentSwitches, uninstall}` (seed in M2)
Indexes: unique `(orgId, entraTenantId)`, `(tenantId, appId)`, `job_runs.key`, `catalog_apps.slug`, text index for search, TTL on `job_runs` (90 days) and logs (90 days).
v1/v2 entities (`custom_app`, `vuln_item`, `app_request`, policy snapshots) are out of MVP.

## 5. Routes and API (App Router)
Marketing: `/`, `/pricing`, `/catalog`, `/catalog/[slug]`, `/security`, `/compare/[rival]`, `/tools/eam-checker`, `/docs/*`, legal. 
App (`/app/...`): `dock`, `tenants`, `tenants/[id]`, `catalog`, `app-sets`, `rings`, `audit`, `billing`, `settings/members`, `settings`.
API: `/api/auth/[...all]` (Better Auth), `/api/tenants` (CRUD, `POST /api/tenants/:id/consent-link`, `GET /api/tenants/consent/callback`), `/api/tenants/:id/groups`, `/api/catalog/search`, `/api/catalog/:slug`, `/api/deployments` (publish), `/api/deployments/:id/rollback`, `/api/rings`, `/api/pause`, `/api/app-sets` (+ `/apply`), `/api/audit.csv`, `/api/billing/checkout|portal`, `/api/webhooks/stripe`, `/api/health`, `/api/cron/[job]` (guarded by `CRON_SECRET`).
Jobs: `catalog-sync`, `catalog-verify`, `package-build`, `publish-step`, `ring-tick`, `fanout`, `tenant-verify`, `tenant-health`, `device-count`, `alert-dispatch`, `cleanup`, `digest-email`.

## 6. Behind an interface (VPS later)
| Interface | Vercel-phase adapter | VPS adapter |
|---|---|---|
| `VmLab` (install/detect/uninstall in a clean Windows 11 VM, snapshots, logs) | `PendingVmLab`: records `vm` step as `pending` | `ProxmoxVmLab` (PowerShell harness, 1 build VM + 6 test VMs) |
| `Scanner` | ClamAV in Vercel Sandbox | ClamAV + Defender + YARA on lab host |
| `JobQueue` | Mongo leases | BullMQ + Valkey |
| `ManifestSigner`, `CredentialSigner` | env key | OpenBao |
| `Mailer` | transactional provider | Postfix + OpenDKIM |
| `LogSink`/metrics | Vercel logs | GlitchTip/Prometheus/Loki |
| `ObjectStore` | Cloudflare R2 | R2 + Storage Box |

**Verification tier (decision D-01).** Brief rule: only `Verified` versions publish. Without a Windows VM a version can reach `verified_static` (hash + signer + scan + detection-rule check) but not the VM punch. Behaviour until the lab is online: the version is publishable only to **Pilot**, with the product UI showing the tag as 3/4 and "VM test pending", Broad promotion keeps the 48 h delay and auto pause, and the marketing copy says exactly that. Env flag `REQUIRE_VM_VERIFICATION=true` (flipped when `ProxmoxVmLab` lands) makes VM mandatory and holds anything without it. The owner can set the flag on to publish nothing until the lab exists. This keeps the product honest and shippable.

## 7. Egress allow list (`infra/egress-allowlist.txt`, enforced in CI)
Static hosts: `login.microsoftonline.com`, `graph.microsoft.com`, `*.blob.core.windows.net` (Intune SAS), `api.stripe.com`, `api.github.com`, `raw.githubusercontent.com`, `*.r2.cloudflarestorage.com`, `*.mongodb.net`, mail provider host, ClamAV signature mirror (`database.clamav.net`). Dynamic hosts: vendor installer hosts, taken only from reviewed winget manifests for the top 200 (a generated `infra/vendor-hosts.txt`); the downloader refuses any other host. Customer Teams/Slack webhook hosts are validated per org (`*.webhook.office.com`, `hooks.slack.com`). CI greps source and fails on any URL host not in the list; the runtime fetch wrapper enforces the same list. Deviation from "Stripe only": Atlas, R2, Vercel and a mail provider are the owner's chosen infrastructure (D-02).

## 8. P0 requirements: how built and acceptance criteria
| # | P0 | Built with | Acceptance criteria |
|---|---|---|---|
| 1 | Entra sign in, orgs, roles, tenant scopes (FR-01..03) | Better Auth Microsoft provider (`organizations` authority), org + member plugins, `authorize()` with tenant scopes | A work account signs in and an org is created on first login. A personal Microsoft account is rejected with an explanation. Roles Owner/Admin/Operator/Viewer enforced on every route. A technician scoped to 3 tenants sees only those tenants, their apps and their audit entries (test with 5 tenants). Sessions in httpOnly cookies. |
| 2 | Tenant connect (FR-04..07) | 3.1 | Consent URL redirects and returns `connected` within 60 s of admin consent. "Send consent link to admin" emails a working signed link and the tenant shows "Waiting for admin". Revoked consent produces `disconnected`, owner email and in-app alert. The permission list shows one line reason each. Consent denied shows which permission and why. |
| 3 | Catalog + verification (FR-08..10, 31, 42, 43) | 3.2, 3.3 | Public search returns in under 300 ms (p95, warm) without login and shows version, last tested date and QA log. At least 200 Windows apps present by M5 (target; count shown is the real number). A version is publishable only when the required checks pass per section 6 tier rules. Manifest signature verified before upload (tamper test fails the upload). A scanner signature older than 24 h holds publication (EICAR test file detected and held). Catalog refreshes every 30 min and shows the MIT notice. |
| 4 | Publish as Win32 (FR-12..16) | 3.4 | Publish creates `DC | App version` in a test tenant with icon, description, publisher; assigns Pilot/Broad groups Required or Available; detection rule auto generated and proven by QA; update only and ESP fixed variants selectable; interrupted upload resumes; same request twice never creates two apps. Needs a real tenant for end to end proof (owner supplied test tenant, MANUAL_STEPS step 5). |
| 5 | Auto update, rings, rollback (FR-18..22) | 3.5 | Per app per tenant auto update toggle. New verified version reaches Pilot, then Broad after delay if Pilot failure is under threshold; otherwise status Paused with two channel alert. Settings carry across versions. One click rollback to any of the last 3 versions re-assigns N Required and N+1 Uninstall for that ring and writes an audit entry. Global and per tenant pause stop all ticks. |
| 6 | MSP features (FR-25/26) | 3.6 | App Set applied to 18 mock tenants with concurrency 3 yields a per tenant result table; a revoked tenant is marked disconnected and the rest continue. Cross tenant dashboard lists out of date apps, paused rings and disconnected tenants. |
| 7 | Audit log CSV (FR-32) | audit module | Every user and system action writes actor, IP, time. No API path updates or deletes entries (tested). CSV export is complete and tenant scope filtered. Hash chain verifies. |
| 8 | Billing (FR-34, 35, 37) | kit billing adapter, 3.6 | Checkout and Portal work in Stripe test mode; plan changes reflect after webhook; banner at over limit with 14 day grace; free limits enforced server side (25 devices, 1 tenant, 15 apps) with upgrade dialog on the 16th app; cancellation offers leave or remove (prefix only). Webhook handled twice produces one effect; failed processing is retried. |
| 9 | Own email + ops (FR-40, 41, 44, 45) | Mailer, suppression, alerts, CI egress check | Welcome, consent link, weekly digest and ring paused email send through the Mailer with suppression and one click unsubscribe. Critical alerts reach email and in app (and Teams/Slack webhook if set). Egress check fails CI on an unknown host. Own MTA, DMARC 98% and self hosted monitoring are VPS phase items, tracked in ROADMAP. |
| 10 | Public pages | marketing system | Home, pricing (device slider), public catalog, security page (permission table, QA pipeline diagram, DPA download), compare pages exist with a Lighthouse score of 90+ and a "Where they are better" section on each compare page. |

## 9. Risks (ranked)
- **R-1 .intunewin compatibility and no Windows lab on Vercel.** Our Node implementation of the content format and the Graph upload must be proven against a real Intune tenant, and the VM verification cannot run until the VPS lab exists. Mitigation: tier rules (section 6), early spike in M2 against an owner supplied tenant (MANUAL_STEPS 5), VPS comparison against IntuneWinAppUtil.
- R-2 Vercel limits (duration, memory, `/tmp`, Hobby cron): resumable job steps, Sandbox for large files, Pro plan before launch.
- R-3 Partner Center publisher verification can take weeks; without it consent screens show "unverified" and some tenants block consent. Start immediately (MANUAL_STEPS 2).
- R-4 Supply chain (critical, per brief): 4 checks, new signer holds, default 48 h delay, auto pause, revoke and rollback playbook.
- R-5 Graph beta/API drift and 429s: contract tests, Retry-After, per tenant concurrency 3.
- R-6 Catalog quality: unknown installer types go to manual packaging; budget 40% of time here per brief.
- R-7 Mail deliverability on a provider adapter (acceptable now; own MTA later).
