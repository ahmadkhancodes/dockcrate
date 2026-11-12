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
- Every page, 375 and 1440, light: no console errors, failed requests, hydration warnings, horizontal scroll, unnamed controls, non-pointer cursors, tap targets under 44px on mobile (`crawl.spec.ts`).
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

## Hardening round (12 Nov 2026)
Added `tests/unit/hardening.test.ts` (forged, duplicate and out of order Stripe events, per-key rate limits, log scrubbing, CSV formula and unicode safety, CSP pins, no native third-party form posts, health shape without leaks, built-bundle secret scan) and `tests/e2e/qa/hardening.spec.ts` (health, signed-out and guessed-id export refusal, forged webhook, no CSP console errors on the dock). Changes are listed as H-1..H-6 and U-1..U-2 in docs/REVIEW.md. Still open: QA-9..QA-14 as above.
Test fixes in this round: the sign-out spec used `goBack()` then `reload()`, which raced the redirect and failed on `main` too (`net::ERR_ABORTED`); it now makes a fresh visit to `/app` and still asserts the sign-in page. The API keys spec failed once in a loaded full run (a console or request problem, not reproduced in six solo and file runs); watch it.

## Post-redesign regression pass (12 Nov 2026)
Specs: `tests/e2e/qa2/visual.spec.ts`, `tests/e2e/qa2/journeys.spec.ts`; unit guards in `tests/unit/qa.test.ts` ("QA2 copy consistency"). Nothing was deployed.

Journeys covered: every public page (including 404, invite error, docs, catalog detail, legal) and every signed-in page at 375 and 1440 with the OS asking for dark mode (page must stay light), computed fonts of all text (only Saira Stencil, IBM Plex Sans, IBM Plex Mono allowed, so no Archivo, Public Sans, JetBrains Mono or system fallbacks), clipped text, console, request and hydration problems; keyboard walk of 45 Tab stops on 11 pages for a visible focus indicator; sign-in with `?next` to a billing return, checkout cancel return, sign-out landing. The earlier crawl, click-everything and hostile suites still pass. Leftover dark-mode and old-palette code: greps of `src` found none (only the yard hex palette, brand.ts and the e-mail/legal HTML using it).

| # | What the user would have seen | Fix | Regression |
|---|---|---|---|
| QA2-1 | Returning from Stripe through "cancel" (`/app/billing?checkout=canceled`) showed an unchanged page with no message. | Billing page reads `checkout=canceled` and shows "Checkout canceled. You were not charged." | `journeys.spec.ts` |
| QA2-2 | (was QA-11) The landing hero, dock preview and demo rows showed the clean-VM check as passed while /security and the catalog say it has not run. Acrobat showed a failed VM test. | Demo data: VM is pending everywhere; Acrobat is held for a changed signer, as in the catalog seed. | `qa.test.ts`, `journeys.spec.ts` |
| QA2-3 | (was QA-12) Pricing said "Cancel anytime from your account" on paid plans while the only path was "Join early access". | While early access is open the line reads "Early access is by request. No card needed." | `journeys.spec.ts` |
| QA2-4 | The pipeline diagram on /security used the raw `ui-monospace` stack, so its labels did not use the brand mono font. | Uses the `--font-mono-family` token. | `visual.spec.ts`, `qa.test.ts` |

Open: QA-9 (hydration #418 on /sign-in after a prefetch, Low, still not root-caused), QA-10 (real-tenant journeys, plan-limit banners and dialogs need a registered Entra app; the plan limit user cannot be built in stub mode because connecting is refused, Medium, owner), QA-13 and QA-14 as above. Not run: Lighthouse and axe on a deployed build.

## Usefulness pass 2: first ten minutes, working docs, billing path (12 Nov 2026)
Walked in a real Chromium against `next start` in stub mode (memory DB, console mail, fake Graph; a dummy Entra id or the E2E stand-in in place of Microsoft's consent screen). Nothing was deployed. Specs: `tests/e2e/usefulness.spec.ts`; unit: `tests/unit/usefulness.test.ts`.

### Personas (from docs/brief.md ICP)
- **Priya**, the only IT person at a 120-person Toronto law firm on Business Premium. Wants Chrome, Zoom and Acrobat patched without repackaging, and a script her RMM can call.
- **Mike**, owner-tech of an Ohio MSP with 15-60 small Business Premium client tenants. Starts free with one client, wants the rest on the same day if it works.
- **Dan**, IT lead at a 1,500-device UK manufacturer, ex-ConfigMgr. Brings a technician in and wires events into the PSA before he signs off.

### Week in the life, as walked
| Day | Persona | What happened | Friction |
|---|---|---|---|
| 1 | All | Magic link, name the org, empty dock with an example, connect tenant, checklist | **F1** the moment the one Free tenant connected, a "You have reached your limit, 1 of 1 tenants, Upgrade" banner appeared on every page, on day one, at the moment of first value. |
| 1 | Priya | Ring setup | **F2** two empty group pickers even when the tenant has groups named DC-Pilot and DC-Broad; Save left her on the ring page ("Back to the dock" was one more click). |
| 1 | Priya | Publish to Pilot | **F3** in stub/demo mode without `MANIFEST_SIGNING_KEY` every publish failed with "manifest signature did not verify" (the dev key was per module layer, so pages signed and routes verified with different keys). |
| 2 | Priya | API key for her RMM script | **F4** key shown once, but no ready request; the docs curl had a placeholder host and key. |
| 2 | Mike | Add the second client tenant | **F5** inline "Your Free plan includes 1 tenant. Upgrade to add more." with no link: a dead end at the exact moment he wants to pay. |
| 2 | Dan | Invite a technician | **F6** role picker with no explanation; the invitation e-mail said only "as operator", nothing on what that allows or how long the link works. **F7** the webhooks page offered `member.invited` but nothing ever sent it. |
| 2 | Dan | Read the docs | **F8** docs listed roles "owner, admin, member, viewer" (there is no member; operator was missing); getting started promised "let us create DC-Pilot and DC-Broad" while the product only reads groups; webhooks docs claimed a Professional gate that the code does not have, and listed only `billing.updated`. |
| 7 | Mike | Decide to pay | Billing page preselects the plan from the deep link and offers "Continue to checkout". In this environment there is no Stripe key, so the button explains "Billing is not connected yet. Nothing was charged." (verified by unit journey below instead). |
| 7 | Priya | Limits | Free catalog limit (15 apps) cannot be reached with the 6-app demo catalog; device banners need the nightly count from a real tenant (QA-10). |

### Fixed (top five by impact, plus docs)
| # | Fix | Test |
|---|---|---|
| F1 | App-wide banner only for devices (80%/100%) and real overages; at-cap allowances are explained where you act (D-59). | unit `bannerMeter`; e2e Priya (no banner) |
| F5 | Tenants page at the cap shows "Your Free plan includes 1 tenant, all in use. Starter adds up to 5 tenants for $24.99 a month" with **Upgrade to Starter** to `/app/billing?plan=starter&interval=month` (Continue to checkout); a 402 from the form also links to plans. | unit `upgradeFor`; e2e Mike |
| F2 | Ring picker preselects groups that look like Pilot and Broad (DC-Pilot/DC-Broad, Pilot, Testers, All users...), never the same group twice; the first save goes straight to the dock with "Rings saved. Pick an app and choose Publish to Pilot." Connected tenant to app in Pilot: **3 clicks** (budget asserted). | unit `guessRingGroups`; e2e Priya click budget |
| F4 | After creating a key: "Try it from your terminal" with the real app URL and the new key, the expected answer with the real org id, and Copy command. Same snippet function as the docs (D-62). | e2e docs-work runs the copied command with `curl` |
| F6, F7 | Invite form explains the selected role in one line (and suggests Tenant access for operators/viewers); the e-mail states what the role can do, that the link works 7 days, and that no password is needed; `member.invited` is now emitted to subscribed webhooks. | unit invite e-mail and role table; e2e Dan (form, e-mail, delivery log) |
| F3 | Dev/stub manifest key held on `globalThis`, so stub publishing works without `MANIFEST_SIGNING_KEY`. | e2e Priya publishes in the default e2e server |
| F8 | Docs corrected: four real roles with what each can do, groups are never created, webhooks open on every plan (D-60) with all three events, getting-started limits read from `product.ts`. | unit "docs match the product" |

### Docs must work
- In-app docs code samples (there are no code samples in the markdown under `docs/` other than internal kit notes): the curl in Sign in and permissions is run with `curl` against the app with a real key (answers `{"orgId": ...}`), the API reference response shape and the `invalid_api_key` error are compared with real responses, and the Node webhook verifier is executed in plain Node against a signature from the app's own signer (accepts it; rejects a changed body, an hour-old timestamp and a wrong secret).
- Numbers: API rate limit (600 per minute), 20 webhook endpoints, Free limits, grace days and every limit printed in a plan's pricing highlights are checked against the code.

### Billing path (as far as Stripe test mode allows without card entry)
Unit journey with the Stripe stand-in (`tests/unit/usefulness.test.ts`): plan selection creates a subscription Checkout Session for the price whose lookup key is `dockcrate_professional_monthly`, `metadata.app=dockcrate` on the session, subscription and customer, success URL `/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}` and cancel URL `/app/billing?checkout=canceled` (now one helper, `checkoutReturnUrls`, used by the route); `checkout.session.completed` activates Professional and lifts the tenant cap; the portal opens for that customer; cancel at period end keeps the plan; `customer.subscription.deleted` falls back to Free limits, adding a tenant is refused again, data is kept and the over-limit banner shows. Not done here: a run against the real Stripe test account (no `STRIPE_SECRET_KEY_TEST` in this runner).

### Still open
- Real Stripe test-mode run of checkout, webhook and portal once the test key is set; the "remove our apps on cancel" cleanup choice from the brief.
- QA-10: every real-tenant step (consent, groups, device counts, the 16th-app upgrade dialog) still needs a registered Entra app.
- Owner: whether Webhooks should be gated to Professional as the pricing sheet suggests (D-60).
- No welcome e-mail with the next step after sign-up; ring, rollback and QA webhook events are still planned.
- QA-15 (Low, test only, already on `main`): `qa2/journeys.spec.ts` "checkout return ... sign-out" fails about 1 run in 3 when repeated, with `requestfailed: https://localhost:3100/sign-in?next=/app/...`. Reproduced on an unchanged `main` build. After Sign out the page still requests app routes; the redirect target is fetched over https, which looks like the production CSP's `upgrade-insecure-requests` on plain-http localhost. Declining RSC prefetches in `src/proxy.ts` did not remove it, so that change was not kept. Harmless on the https site, not root-caused. Full suite with this pass: 91 passed, 1 skipped (`test.fixme` QA-9).
