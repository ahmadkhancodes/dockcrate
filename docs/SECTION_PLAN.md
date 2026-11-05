# SECTION_PLAN: landing page (https://dockcrate.buffersoltech.com)

Layout type A (classic hero + sections). One offer, one audience, one action: **Start free with Microsoft** (Entra work-account sign-in, free plan, no card). Conversion = completed sign-in that creates an org. Secondary links stay text-weight.
Audience: US MSPs (10 to 150 tenants, Business Premium) and lean internal IT without Enterprise App Management. Traffic: Reddit (r/Intune, r/msp), "Pckgr alternative" search, MVP walkthroughs. Visitors know the problem (repackaging by hand).
Truth rules: only facts from `docs/brief.md`. No logos, testimonials, customer counts or uptime claims. Items marked `{{fill}}` stay placeholders until real data exists. Demo UI is labelled "Demo data". Comparison lines always show name, price, source and date (checked Nov 3, 2026).
Copy rules: sentence case, no hyphens inside body copy or headings (rewrite the phrase), `text-wrap: balance` on headings, no orphan last word, CTA = verb + what you get.
SEO: index. JSON-LD SoftwareApplication + FAQPage. Title: "Intune app packaging and patching for MSPs | DockCrate by BufferSol". Meta: "Third-party apps for Intune, packaged, inspected and shipped in rings. Multi-tenant from $24.99/mo. Free plan, no card."

## Nav
Logo (DockCrate / by BufferSol) · Catalog · Pricing · Security · Compare · Docs · [Sign in] · **[Start free with Microsoft]**

## 1. Hero
- Eyebrow: "Works with Microsoft Intune"
- H1: "Third-party apps for Intune, packaged, inspected and shipped in rings" (one word, "rings", in dock green; no period)
- Sub: "Multi-tenant from $24.99/mo. Every version hash-checked, scanned and test-installed before it reaches a single device."
- Primary CTA: "Start free with Microsoft". Secondary text link: "Browse the public catalog".
- Risk line: "Free plan: 25 devices, 1 tenant, 15 apps. Rings and rollback included. No card."
- Proof strip (all from the brief): "3 Graph permissions, each explained" · "4 checks before a version ships" · "48 h default Broad ring delay".
- Visual: coded CrateLabel (7-Zip, SHA prefix, tag) + BayTrack rows (one shipped to Pilot, one Paused). At 375 crop to the crate and one bay row. Labelled "Demo data".

## 2. The problem (their words)
- H2: "One Chrome update. Eighteen tenants. About an hour each."
  (Brief: roughly 1 hour per app version by hand, founder-stated; Recast puts a standard app at about 4 h including testing.) Use the safe version: "Every vendor update is another .intunewin to build, test, upload and assign."
- Body: "Intune can deploy Windows apps, but each third party app needs a packaged Win32 wrapper, install and uninstall commands and a detection rule, repackaged for every vendor update. Small teams repackage 5 to 10 apps a month. Multiply by your tenants."
- Cite: "Source: Recast, 4 to 12 hours per manually packaged app including testing." Link in footnote.
- Layout: left-aligned statement + a stepped "by hand" checklist (package, test, upload, assign, repeat) set against a single DockCrate line ("Search, publish, done"). Not a card grid.

## 3. Tagline reveal (mandatory, B11)
- Statement (word by word activation, 25 to 35% to 100%): "Autopatch handles Microsoft. DockCrate by BufferSol handles everything else, tested before it ships."
- Reduced motion: full colour immediately.

## 4. How it works (3 steps, each with a real UI fragment)
1. **Connect a tenant.** "You'll need a Global Admin for one click. Not you? Send them this link." Fragment: consent screen summary with the 3 permissions. Status shows "Connected" within 60 seconds.
2. **Pick your rings.** "Choose a Pilot and a Broad group. Defaults: Pilot 0 h, Broad 48 h." Fragment: BayTrack with thresholds (10% fail).
3. **Publish and let it update.** "Search an app, publish, and it shows up in Intune. New versions go to Pilot first, then Broad, or pause themselves." Fragment: CrateRow list with live progress.
Target line (brief claim, mark as target): "Target: search to published in under 120 s median."

## 5. The inspection tag (signature section, split layout)
- H2: "Four checks before any version reaches a device"
- Left: the InspectionTag large, with four punched checks. Right: a four row list.
  - **Hash.** Installer SHA-256 must match the manifest.
  - **Signer.** Same signer as the previous version, or it is held for manual review.
  - **Scan.** Scanned in house with two engines; stale signatures hold publication.
  - **VM.** Installed, detected, launched and uninstalled in a clean Windows VM.
- Note: "Every version has a public QA log. No login." CTA link: "Read a sample QA log".
- Honest state: while the Windows test lab is being commissioned, the VM punch shows as "pending" on any version not yet lab tested (see ARCHITECTURE section 6). Copy must never claim a VM test that did not run.

## 6. Features (asymmetric bento, five items, not three equal cards)
Each benefit first, proof beside it.
- **Rings and rollback on every plan.** Roll back to any of the last 3 versions in one click; the audit log records it.
- **Multi tenant from the first paid plan.** Starter covers 5 tenants. App Sets push a baseline of apps and ring defaults to many tenants at once.
- **Update only variants.** Publishes as a requirement-script app so it never installs where the app is absent.
- **Audit log you can export.** Every user and system action with actor, IP and time, as CSV.
- **Three permissions, each explained.** Table of the 3 Graph permissions with what each lets us do and what it doesn't.
- (v1 items shown as "Coming" only on the roadmap page, not in the feature bento: macOS, client PDFs, UK data region.)

## 7. Security and trust
- H2: "Another vendor with write access to your tenants? Read exactly what we ask for."
- Permission table (`DeviceManagementApps.ReadWrite.All`, `DeviceManagementManagedDevices.Read.All`, `Group.Read.All`), one-line reasons each, plus "what it doesn't allow".
- Copy: "Your tenant data never touches a third party API." "No sub-processors except Stripe." Only claims we can keep; "verified publisher" is shown only after Partner Center verification (placeholder `{{publisher-verified}}`).
- Links: Security page, DPA download, sample QA log.
- Do not claim SOC 2, ISO 27001 or uptime. Roadmap line only: "SOC 2 Type 1 is on the roadmap" (brief: within 18 months, est.).

## 8. Compare (honest)
- H2: "Robopack has a bigger catalog. IntuneGet is free. Here's when we're the better pick."
- Table (3 rows, date stamped "checked Nov 3, 2026"):
  - Pckgr Starter: $49/mo, single tenant (pckgr.com). DockCrate by BufferSol Starter: $24.99/mo, 5 tenants.
  - Microsoft Enterprise App Management: included in M365 E5; add on for E3 and Business Premium ($2 to $5 per user per month), no rings or rollback.
  - IntuneGet: free, open source, no SLA.
- Link: "Where they are better" (full compare pages, one per rival).
- EAM checker CTA: "Do you have Enterprise App Management? Check in 3 questions."

## 9. Pricing (device slider)
- H2: "Roughly half the price of the tools you're comparing us with. Same device tiers, so you can check."
- Slider (devices) showing DockCrate price and the competitor price for the same tier; each competitor line shows source and date.
- Plans: Free $0 (25 devices, 1 tenant, 15 apps) · Starter $24.99/mo (100 devices, 5 tenants, $249.50/yr) · **Professional $49.99/mo** (1,000 devices, unlimited tenants, App Sets; $499.50/yr) highlighted · Business $74.99/mo (2,500 devices; $749.50/yr) · Fleet $99.99/mo (5,000 devices). Education and non profit: $34.99/mo with proof.
- Features rows list differences only. Buttons: "Start free" / "Start Starter" / etc. Risk reversal under buttons: "The free plan is the trial. No card."
- Note: Business and Fleet items that depend on v1/v2 (Custom Apps, Defender queue, policy backup, SSO RBAC, SLA) appear in the pricing page only with "roadmap" tags until shipped.

## 10. FAQ (8 items, FAQPage schema)
1. Another vendor with write access to all my tenants? (3 permissions with reasons, public QA pipeline, DPA, publisher verification status.)
2. Will you be around in two years? (Honest answer: BufferSol product, exports always available, apps stay in Intune if you cancel.)
3. Do I have Enterprise App Management? (E5 yes; E3 and Business Premium no; checker.)
4. winget supply chain risk? (4 checks, 48 h Pilot-to-Broad delay by default, auto pause.)
5. Why not free IntuneGet or Robopack's free tier? (SLA, support, MSP multi-tenant ops, rings and rollback; they have strengths and we say so.)
6. What happens to my apps if I cancel? (Leave them in Intune or remove only apps prefixed "DC |"; CSV export.)
7. Which Windows apps and how many? (Catalog size is the real number at launch; target 200 verified at MVP.)
8. Is there an agent or RMM? (No. Intune only.)

## 11. Final CTA
- H2: "Your dock is empty. Start with the 5 apps your devices already have."
- Same CTA: "Start free with Microsoft". Risk line repeated.

## Footer
"A BufferSol product" · Product (Catalog, Pricing, Security, Compare, Docs) · Legal (Privacy, Terms, DPA, Sub processors) · "Works with Microsoft Intune. Microsoft and Intune are trademarks of Microsoft; DockCrate by BufferSol is not endorsed by Microsoft." · winget-pkgs MIT notice on catalog pages.

## Other marketing routes (same system)
- `/pricing`: sections 9 + 10 + feature comparison.
- `/catalog` and `/catalog/[slug]`: public search (no login, under 300 ms), version, last tested date, QA log, MIT notice. Programmatic pages "Deploy {App} with Intune" with detection rule and QA log (only for versions that exist).
- `/security`: permission table, QA pipeline diagram, DPA download, sub processors (Stripe only plus hosting).
- `/compare/pckgr`, `/compare/robopack`, `/compare/intuneget`, `/compare/patch-my-pc`, `/compare/eam`, each with "Where they are better".
- `/tools/eam-checker`, `/docs/*`, legal pages, branded 404, OG images.

## Placeholders to resolve before launch (listed for hand-off)
`{{publisher-verified}}` (Partner Center), `{{catalog-count}}` (real verified count), `{{testimonial}}`, `{{design-partner-case-study}}`, `{{dpa-pdf}}`, `{{uspto-clearance}}`.
