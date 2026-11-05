# Manual steps for DockCrate by BufferSol (owner only; deep link first)

Nothing blocks Phase 0 or M1. Steps 1 and 2 should start now (Microsoft verification can take weeks). Do one at a time, in order. All values are ready to paste.

## 1. Entra multi-tenant app registration (needed before M2)
Deep link: https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/isMSAApp~/false
- Name: `DockCrate by BufferSol`. Supported account types: **Accounts in any organizational directory (Any Microsoft Entra ID tenant, Multitenant)**. Do NOT tick personal Microsoft accounts. Redirect URI type **Web**, first value below; add the rest later under Authentication.
- Redirect URIs (Web), all of:
  - `https://dockcrate.buffersoltech.com/api/auth/callback/microsoft`
  - `https://dockcrate.buffersoltech.com/api/tenants/consent/callback`
  - `https://dockcrate.vercel.app/api/auth/callback/microsoft`
  - `https://dockcrate.vercel.app/api/tenants/consent/callback`
  - `http://localhost:3000/api/auth/callback/microsoft`
  - `http://localhost:3000/api/tenants/consent/callback`
  (If the real `*.vercel.app` host differs, it is in docs/PROGRESS.md.)
- API permissions, Microsoft Graph: **Application**: `DeviceManagementApps.ReadWrite.All`, `DeviceManagementManagedDevices.Read.All`, `Group.Read.All`. **Delegated**: `User.Read`, `openid`, `profile`, `email`. Do not click "Grant admin consent" in your own tenant unless you want to test with it. Publisher domain: `buffersoltech.com`.
- Home page URL `https://dockcrate.buffersoltech.com`, Privacy `https://dockcrate.buffersoltech.com/legal/privacy`, Terms `https://dockcrate.buffersoltech.com/legal/terms`.
- You'll see: an Overview page with **Application (client) ID** and **Directory (tenant) ID**. Send both to the orchestrator (they are not secrets).

## 2. Microsoft Partner Center publisher verification (start now, weeks)
Deep link: https://partner.microsoft.com/dashboard/account/v3/organization/identity
- Enrol BufferSol Technologies in the Microsoft AI Cloud Partner Program (free) and note the **MPN ID**; then in the app registration go to Branding & properties and click **Add MPN ID to verify publisher**. Doc: https://learn.microsoft.com/entra/identity-platform/mark-app-as-publisher-verified
- Paste the MPN ID in the Branding blade. You'll see: "Verified" under Publisher domain. Until then consent screens show "unverified" and some tenants block consent.

## 3. Upload the app certificate (public part only; I generate the pair)
Deep link: https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade (open the app, then Certificates & secrets, Certificates, Upload)
- The orchestrator session generates the keypair and puts the public `dockcrate-graph.cer` in `docs/` (never the private key, which goes straight into Vercel encrypted env via the Vercel connector). Upload that `.cer`.
- You'll see: a thumbprint listed. Send the thumbprint to the orchestrator.

## 4. Set the Entra values in Vercel (I do this if my Vercel connector works; otherwise)
Deep link: https://vercel.com/dashboard (project `dockcrate`, Settings, Environment Variables)
- Names: `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_CERT_THUMBPRINT`, `ENTRA_CLIENT_CERT_PRIVATE_KEY_PEM`, `BETTER_AUTH_SECRET`, `CRON_SECRET`. I will set all of them through the API; this step is only needed if the connector refuses.

### 4b. Every Entra and signing variable, and where each value comes from
Set these in the Vercel project (Production and Preview), never in the repo. Leave them all unset to stay in stub mode (fake Graph, email link sign in).

| Variable | Where to get it |
|---|---|
| `ENTRA_CLIENT_ID` | Step 1: the **Application (client) ID** on the app registration Overview page. Not a secret. Setting it turns on Microsoft sign in and the real Graph client. |
| `ENTRA_CLIENT_SECRET` | Optional, sign in only. Entra admin center, the app, **Certificates & secrets**, **Client secrets**, **New client secret**; copy the **Value** at once (shown once). Graph calls to customer tenants use the certificate below, not this. |
| `ENTRA_CLIENT_CERT_PRIVATE_KEY_PEM` | The private key of the certificate pair generated in step 3 (PEM, `-----BEGIN PRIVATE KEY-----`). Paste it with real line breaks or with `\n`. The public `.cer` is what step 3 uploads. |
| `ENTRA_CLIENT_CERT_THUMBPRINT` | Entra admin center, the app, **Certificates & secrets**, **Certificates**: the **Thumbprint** column after the upload in step 3 (40 hex characters, SHA-1). A 64 character SHA-256 value also works. |
| `MANIFEST_SIGNING_KEY` | An Ed25519 private key in PKCS#8 PEM that signs package manifests. Generate once: `openssl genpkey -algorithm ed25519`. Paste the whole PEM (`\n` allowed). Keep a copy in a password manager: a new key makes every stored manifest fail its signature check until the catalog is re-signed. Without it a real deployment refuses to publish (503). |
| `GRAPH_DRIVER` | Optional override: `real` or `fake`. Default is `real` once `ENTRA_CLIENT_ID` and a secret or certificate are set. |
| `CRON_SECRET` | Any random 32+ character string. Vercel Cron sends it as `Authorization: Bearer ...` to `/api/cron/*` (see `vercel.json`: `rings-tick` every minute, `device-count` nightly, `catalog-sync` nightly). Per minute cron needs Vercel Pro (step 6); on Hobby call `/api/cron/rings-tick` from the Cloudflare worker in `infra/cron-worker` instead. |

## 4c. Other production env vars (Vercel project `dockcrate`, Production) and one command
Added by the M5 review: these are read by the code but were not listed.
| Variable | What |
|---|---|
| `MONGODB_URI`, `MONGODB_DB=dockcrate` | Atlas connection string for user `dockcrate-app` (readWrite on `dockcrate` only). |
| `BETTER_AUTH_SECRET` | 32+ random characters (`openssl rand -base64 32`). Also signs consent state and links. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe test keys first; the webhook secret from the endpoint `https://dockcrate.buffersoltech.com/api/stripe/webhook`. |
| `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` | Mail. |
| `ALTCHA_HMAC_KEY` | 32+ random characters. |
| `ADMIN_EMAILS` | Founder admin emails, comma separated. |
| `APP_FLAGS` | Leave `payments_enabled` off until step 11 is done. |
| `REQUIRE_VM_VERIFICATION` | Leave unset (off) until the VM lab exists: VM pending versions are Pilot only (D-01). |
- Then once, from a machine with the Atlas URI: `npm run db:indexes` (creates the unique indexes the publish idempotency and audit chain rely on).

## 11. Launch gate (M5 review P1-5)
- Real publishing needs the real downloader, scanner and winget adapters (not built; VPS phase) and the real tenant spike (step 5). Until both exist no catalog version can reach a real tenant. Keep `payments_enabled` off and sell nothing until one real version has gone Pilot to Broad in the test tenant.

## 5. A test Intune tenant for the M2 spike (needed before the M2 exit check)
Deep link: https://developer.microsoft.com/microsoft-365/dev-program
- Join the Microsoft 365 Developer Program (or use any trial tenant with Intune and one Windows test device), create two groups `DC-Pilot` and `DC-Broad`, and give a Global Admin account to consent.
- You'll see: a tenant ID and an admin login. Keep the login to yourself; when I need the consent click I will send you the exact link (that click is manual: Microsoft login + MFA).

## 6. Vercel Pro (before launch, also needed for per minute cron)
Deep link: https://vercel.com/account/billing (new account)
- Upgrade the account that owns project `dockcrate` to Pro. You'll see: Plan "Pro". (Hobby is non commercial and has one cron per day.)

## 7. DNS for `dockcrate.buffersoltech.com`
Deep link: https://dash.cloudflare.com/ (buffersoltech.com, DNS, Records)
- Add CNAME `dockcrate` pointing to `cname.vercel-dns.com`, proxy status **DNS only**. If `CLOUDFLARE_SAAS_TOKEN` is set I do this myself and this step disappears.
- You'll see: the domain turns "Valid configuration" in Vercel.

## 8. Keys the build session is using stubs for
- `STRIPE_SECRET_KEY_TEST`, `RESEND_API_KEY` (mail), `CLOUDFLARE_SAAS_TOKEN`, `CLOUDFLARE_SAAS_ACCOUNT_ID` (R2 + DNS). Add to the cloud environment secrets; the build session wires them in.

## 9. Later, VPS phase (not blocking)
- A VPS plus Windows 11 licences for the VM test lab (turns on the VM punch), and trademark clearance for "DockCrate" in classes 9 and 42 before public launch.

## 10. Legal placeholders (before launch)
(Numbered 10 because sections 7 to 9 already exist.)
- `{{jurisdiction}}`: the governing law jurisdiction. Owner supplies it; it flows from `legal.jurisdiction` in `src/config/product.ts`.
- `{{registered address}}`: BufferSol Technologies registered address. Owner supplies it; it flows from `legal.address` in `src/config/product.ts`.
- `{{dpa-pdf}}`: a signable DPA PDF to link from the DPA page.
- `{{refund policy}}` and `{{cap}}` in the terms of service (refund wording and liability cap) also need owner decisions.
- The legal text needs a lawyer's review before launch.
