# QA report: battle test as the ICP (12 Nov 2026)

Scope: every P0 journey that can be driven in the shipped configuration (stub mode: memory DB, console mail, no Entra app, fake Graph), walked in a real Chromium against `next start`, signed out, as a Free user and as invited roles. Specs live in `tests/e2e/qa/`; unit regressions in `tests/unit/qa.test.ts`. Nothing was deployed.

## Journeys covered (one line each)
- Visitor: landing CTA -> early access form -> real ALTCHA proof and submit (CSP checked, no blocked requests) -> "You are on the list"; empty, malformed and hostile input shows a visible message (`visitor.spec.ts`).
- Visitor: pricing buttons resolve, monthly prices equal `product.ts`, roadmap items are tagged; catalog search, empty result, hostile query, detail page and QA log; 404 page; every header and footer link; every in-page link on docs, catalog, security, compare, pricing, legal (`visitor.spec.ts`, `ux.spec.ts`).
- Visitor: signed out `/app/*` redirects to sign-in and returns to the page after sign-in; protected APIs answer 401/403; `?next=//evil` cannot redirect off site; bad email, reused magic link and garbage token explain themselves (`visitor.spec.ts`).
- New user: sign in through the e-mail outbox, onboarding validation (empty, spaces, 200 chars, HTML/unicode names, double click creates one org) (`user.spec.ts`).
- Free user: dock empty state -> Connect a tenant -> add tenant; API keys (secret shown once, copy, duplicate, hostile name, delete with Escape and confirm); webhooks (http and malformed URL refused, add, pause, resume, delete); members (invalid, self, duplicate invite, mail sent); notifications and profile save; audit CSV download, chain verify, filters; billing toggle and plan buttons in stub mode; App Sets and MSP view upgrade states; sign out then back button; another organisation cannot read or delete my data (`user.spec.ts`).
- Account: passkey and authenticator buttons always answer; long/unicode name; data export; delete account end to end with typed confirmation; invited Viewer is read only in UI and API (`account.spec.ts`).
- Hostile input: founder pages and cron endpoints refuse strangers and users; oversized, malformed and cross-site API writes; SSRF-style webhook URLs; early-access API garbage; hostile slugs; hostile sign-in e-mails (`hostile.spec.ts`).
- Every page, 375 and 1440, light and dark: no console errors, failed requests, hydration warnings, horizontal scroll, unnamed controls, non-pointer cursors, tap targets under 44px on mobile (`crawl.spec.ts`).
- Every enabled button on every marketing and app page is clicked and must change something (`clickall.spec.ts`); mobile menu focus trap and Escape, theme toggle persistence, keyboard-only sign-in, dialog focus return, billing and pricing numbers against config, bogus deep links (`ux.spec.ts`, `clickall.spec.ts`).

## Defects found and fixed
| # | What the user would have seen | Fix | Regression |
|---|---|---|---|
| QA-1 | "Add and connect" (and "Connect with Microsoft", and "Send link to admin") without a registered Entra app sent the user to a Microsoft page saying `AADSTS900144: client_id missing`, after creating a half-made tenant row that used up the Free plan's single tenant. | `assertConnectAvailable()` in `src/lib/tenants/index.ts`, used by `POST /api/tenants` and the consent-link route (503 `connect_unavailable`, nothing created); the status route returns `consentUrl: null`; the UI shows a calm "opens with early access" message. | `user.spec.ts` dock -> tenants |
| QA-2 | A technician invited by an MSP, new to DockCrate, was sent to "Name your organization" before the invitation, ending up with a stray org of their own. | `newUserCallback()` in `src/components/app/redirect.ts`: invitation links skip onboarding. | `account.spec.ts` viewer test, `tests/unit/qa.test.ts` |
| QA-3 | `DELETE /api/webhooks/:id` answered "deleted" and wrote a `webhook.deleted` audit row for an id that is not in your org (including another org's). Data was never touched, but the log and the answer were false. | 404 when the endpoint is not in the caller's org. | `user.spec.ts` cross-org test |
| QA-4 | Small buttons (Sign out other sessions, Send test, Pause, Delete, etc.) were 32px high on phones. | `size="sm"` is 44px below `sm`, 32px from tablet up. | `crawl.spec.ts` (375) |
| QA-5 | The accept-invitation error page ("We cannot open this invitation") had no heading for screen readers. | Visually hidden `h1`. | `clickall.spec.ts` deep links |
| QA-6 | Test infrastructure: the e2e mail outbox was a module-level array, so mail sent from the render layer never showed in `/api/dev/outbox` (sign-in specs saw no mail after any page had rendered). Dev and test only. | Outbox is held on `globalThis`. | `tests/unit/qa.test.ts` |

## Open
| # | Severity | Item |
|---|---|---|
| QA-9 | Low | React error #418 (hydration mismatch) logs once on `/sign-in` at 375px when it is loaded after any page that prefetched it. DOM equals the server HTML afterwards and nothing is visible; blocking `_rsc` prefetch removes it. Tracked by `test.fixme` in `crawl.spec.ts`; the crawl filters exactly this one message on this one page. Not root-caused in this pass. |
| QA-10 | Medium (owner) | Everything after "connected tenant" (dock rows, publish, rings, rollback, App Sets runs, MSP dashboard data, 16th-app upgrade dialog, device banners) cannot be driven end to end without a registered Entra app. Covered by the unit suites on fake Graph only; run a real-tenant pass once `ENTRA_*` exists. |
| QA-11 | Low | Landing hero preview shows 7-Zip with all four checks "passed" while the catalog and security pages say the VM check is pending. The hero is labelled "Demo data", but the numbers disagree. Copy call for the owner. |
| QA-12 | Low | Pricing cards say "Cancel anytime from your account" while the only path today is "Join early access". Reword while early access is the only entry. |
| QA-13 | Low | The early-access form has no client-side validation; an empty submit makes a round trip (and the ALTCHA proof) before showing the error. Works, slightly slow. |
| QA-14 | Info | Better Auth limits magic links to 5 per minute per IP; an office behind one NAT signing in together could hit "Too many attempts". Message is shown correctly. |
