# Design brief: DockCrate by BufferSol (redesign, 12 Nov 2026)

Replaces the Phase 0 "loading dock" look in docs/DESIGN.md (cream paper, dock green, amber tags, stencil type). The founder judged that look as typical AI output. This brief is the gate for every UI change (docs/factory/DESIGN_PLAYBOOK.md section 1). Light mode only (D-52).

## 1. Competitor and taste audit (Playwright, 12 Nov 2026)

Screenshots at 1440x900 and 375x812 (above the fold plus full page) in `docs/design/refs/2026-11-12/`.

| Site | Hero claim | Hero visual | Palette, type | Density, proof, CTA |
|---|---|---|---|---|
| Pckgr (direct rival) | "Application management. Your way." | Two cartoon mascots in caps with laptops | Navy `#0E131B`, cyan to blue gradient headline, lilac button; Inter 700 | Low density, check lists, "Book a walkthrough" twice above the fold, chat bubble |
| Robopack | "Meet the Future of Intune Patching" | Two tilted dark dashboard shots, too small to read, over a purple glow | Deep purple, periwinkle pill buttons; Barlow | Logo wall (adidas, Amgen, EA), "Request a demo" + "Try now" |
| IntuneGet | "Deploy any Windows app to Intune. Search it, ship it." | A live packaging pipeline card (Prepare, Install, Detect, Uninstall, Verify) and a search box | White, slate ink, teal accent; Inter 800, round 12px cards and pill chips | Medium density, trust row with icons, "Get Started" |
| Patch My PC | "Automate Third-Party Patch Management in Intune & ConfigMgr" | Centred headline over a dark collage of dashboards, donut charts, dashed connectors | Navy, mint button; Poppins 700 | G2 stars (710 reviews), "Get a Demo" + "Get Pricing" |
| Tailscale (adjacent: loved by MSP and IT admins) | "The best secure connectivity platform for the AI era" | Product crops in a framed panel | Warm grey, black buttons, one red product tile; their own grotesk, mono in the top bar | Black square-ish buttons, very restrained colour |
| Linear (adjacent: the tool technicians cite as "good software") | Short product statement | Real, legible, full width app UI | Near black and white, one accent used rarely; tight grotesk | High density, the UI is the proof |
| NinjaOne (adjacent: the RMM many of our MSPs run) | Endpoint management claim | Dashboard screenshot | Navy and blue, rounded cards | Enterprise logo wall, demo first |

What they all share (the category cliché): dark navy or purple backgrounds with a glow, a gradient or two-colour headline, a floating or tilted dashboard screenshot nobody can read, pill buttons, Inter-class type, logo walls and "Book a demo". The two light ones (IntuneGet, our current site) fall into the other cliché: soft rounded cards and pills, or cream paper with a dark green accent (the "Claude" palette).

What the ICP actually loves (Tailscale, Linear, the Intune and RMM consoles they live in): white working surfaces, black buttons, dense legible tables, mono for identifiers, colour reserved for state.

Gap we own: **the change sheet.** No competitor shows the evidence of a release as the hero: which version, which checks passed, which ring it sits in, what happens next, at a size you can read. We make that the product shot, full width and flat.

## 2. Intake (one batch)
- One primary action: "Get early access" while `EARLY_ACCESS` is on, then "Start free" (Microsoft sign in). Secondary: browse the public catalog.
- Offer: Free plan (25 devices, 1 tenant, 15 apps, rings and rollback). Paid from $24.99/mo (Starter, 5 tenants). Prices from docs/brief.md only.
- Conversion: early access form submitted, later a connected tenant.
- Top objections: another vendor with write access to all tenants; will this vendor exist in two years; why not free IntuneGet or EAM.
- Traffic: r/msp, r/Intune, search for "Pckgr alternative", "Intune third party patching".
- Proof assets: none from customers (no logos, no quotes, no counts). Proof is the product's own evidence: permission list, QA log, prices, sources with check dates.
- Guarantee: free plan is the trial, no card, apps stay in Intune after cancel.
- Voice: a calm senior Intune engineer. Numbers over adjectives.
- Mobile: read mostly (checking a paused ring between client sites); the primary action must be visible in the first screen.

## 3. ICP card
Mike owns a 3 to 40 person MSP with 15 to 60 client tenants on Business Premium and 500 to 1,500 devices; his lead tech reads the Graph permission list before he pays. He buys alone on a card up to about $1,200 a year. He fears a bad update breaking 400 machines and a vendor holding write access to every tenant. He lives in the Intune admin center, his RMM (NinjaOne, Datto, N-able), a PSA ticket queue and PowerShell, on three monitors at a desk and on a phone between sites. He trusts tables, version strings, hashes, timestamps and change tickets; he distrusts mascots, gradients and adjectives. Secondary: Priya, a one person IT department; Sam, a school IT coordinator who needs calm, large targets.

## 4. Positioning
For MSPs on Intune without Enterprise App Management who repackage Chrome, Zoom and 7-Zip by hand for every tenant, DockCrate by BufferSol is the Intune app packaging service that checks every version's hash, signer and malware scan and ships it Pilot first, Broad 48 h later, with one click rollback, from $24.99/mo for 5 tenants, unlike tools that put multi tenant and rollback behind $99 to $149 plans.

Layout type: **A, classic hero plus sections**, hero copy on the left and the change sheet spanning the full container below it (not beside it). Reason: the buyer arrives knowing the problem; one legible product view does the arguing.

## 5. Section plan (home)
1. Hero: H1 "Patch every client tenant / from one change sheet". Sub: what is checked, the rings, the price. CTA "Get early access"; secondary text link "Browse the public catalog"; proof line beside the CTA: "3 Graph permissions · 4 checks per version · Pilot 0 h, Broad 48 h". Then the full width change sheet (real component, demo data, labelled).
2. Today and next: two plain ruled columns, no cards.
3. The problem: a ruled "by hand" list against "with DockCrate", source cited.
4. Tagline reveal (mandatory, word by word).
5. How it works: three numbered rows (01, 02, 03) zig-zag with real UI fragments.
6. Inspection: full bleed graphite band with the QA log rendered as a console log (the one dark band on the page).
7. What you get: one wide lead item plus a ruled list, not a card grid.
8. Permissions: the real table.
9. Comparison: the real table with check date.
10. Prices: one ruled row of five plans.
11. FAQ: heading on the left, questions on the right (two column at 1440).
12. Final CTA: same action as the hero.

## 6. Visual system ("change sheet")
Concept: a release is a change ticket. Every surface reads like a well kept change sheet: white paper, hairline rules, mono identifiers, one highlighter mark for the thing that needs a human.

Differs from the three closest rivals on palette (white and graphite, not navy or purple), type (expanded grotesk plus Public Sans, not Inter or Poppins), layout (full width flat sheet, not tilted screenshots or mascots) and imagery (legible real UI). Differs from our old look on every axis: no cream, no green, no stencil, no dashed crates.

### Palette (role tokens in `src/app/globals.css`, light only)
| Role | Value | Use, contrast |
|---|---|---|
| `surface` | `#F4F5F6` cool canvas | App background, marketing alternate bands |
| `surface-raised` | `#FFFFFF` | Paper: panels, tables, marketing default |
| `surface-sunken` | `#ECEEF0` | Selected rows, table heads |
| `surface-inverse` | `#15181C` graphite | The single dark band, tooltips |
| `text` | `#15181C` | 17.8:1 on white |
| `text-subtle` | `#4B535C` | 7.8:1 on white |
| `text-muted` | `#5B636C` | 5.6:1 on canvas |
| `border` / `border-strong` | `#DDE0E4` / `#B8BEC5` | Hairlines all round or none |
| `action` / `action-hover` | `#15181C` / `#323942` | Primary buttons are graphite with white text. Links are ink, underlined |
| `mark` / `on-mark` | `#D7F25C` signal lime / `#15181C` | The highlighter (graphite on lime 14.2:1). One use per view: the row or word that needs attention, the active ring, selection. Never text colour, never a button fill |
| `focus` | `#2C55D9` | Focus ring only, 2px with 2px offset, 6.2:1 on white. The only blue in the product |
| `success` / `warning` / `danger` | `#12703A` / `#8A5300` / `#B42318` with pale surfaces | State only, always icon plus word |

Override recorded: the playbook says "one accent". Our accent is the lime mark; graphite carries actions. The focus blue is a functional colour, not brand.

### Type (next/font, self hosted)
- Display: **Archivo** variable at width 115 (expanded), weights 600 and 700. Headings and big figures. Wide letters read like a stamped header on a work order and nothing in the category uses them.
- Text: **Public Sans** 400/500/600. The US government's interface face: plain, very legible in dense tables, neutral without being Inter.
- Mono: **JetBrains Mono** 400/500 with tabular figures for every version, hash, count, time and price figure. Technicians know it from their editors.
- Named styles only (heading-1..6, title, body, button, caption, `label-mono` for column heads). No italics, no weight above 700. Inter, Geist, Roboto, Arial remain banned.

### Grid, radius, borders, elevation
- 12 column grid in a 1200px container; the hero heading spans 9 columns, the change sheet spans 12. Section padding varies by role: hero 64/96, argument sections 96, ruled lists 64, the dark band 80, FAQ 96.
- Radius by object, not one number: tags and chips 2px, buttons and inputs 4px, panels and tables 6px, dialogs 8px. No pills.
- Borders: 1px hairlines all round; rows divided by rules. No shadows except menus and dialogs (`0 12px 32px rgb(21 24 28 / .14)`).

### Imagery and icons
- Real product components with demo data, always labelled "Demo data". No illustrations, no mascots, no stock, no emoji.
- Phosphor icons, regular weight, 16 or 20px, only where they carry meaning (status, actions). No icon tiles.

### Motion
- One curve `cubic-bezier(0.22, 1, 0.36, 1)`; 200 to 300 ms colour, 600 ms reveal. Hero: the paused row's lime mark draws in once (scaleX from the left). Tagline reveal word by word. Everything becomes plain opacity under `prefers-reduced-motion`.

### App UI
- Shell: a 232px white rail with a mono org header, text navigation with a lime bar on the current item, and a 56px top bar per page with the title and one primary action on the right.
- Tables: 40px rows, sticky head on sunken grey, mono right aligned numbers, status as icon plus word. 12 to 14 rows visible at 1440x900.
- Empty states: a ruled example row in grey ("7-Zip 25.01 · Pilot · Broad in 48 h") plus one action.
- Loading: skeleton rows shaped like the table. Errors: what failed and the next step, inline.
- 44px minimum targets, pointer cursor on everything clickable, visible focus.

## 7. Bans checked on every page
Centred hero over a glow; purple, indigo or default blue accent; one system font everywhere; three identical icon cards; "Everything you need"; emoji or stock art; glassmorphism; one radius everywhere; pill badges; identical section rhythm; invented numbers; "streamline", "seamless", "supercharge".

## 8. Self critique log
Scores per round are in docs/design-qa.md; final screenshots in docs/qa/design/.
