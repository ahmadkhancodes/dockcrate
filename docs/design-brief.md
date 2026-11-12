# Design brief: DockCrate by BufferSol ("yard" identity, 12 Nov 2026)

Replaces the "change sheet" look (white paper, graphite buttons, signal lime mark, Archivo expanded) of earlier on 12 Nov 2026. Reason: seven BufferSol sibling products had drifted into one house look (warm or white paper, black buttons, a serif or neutral grotesk). Each product must look like its own company. DockCrate's fixed direction: IT operations. Cool concrete grey surfaces, graphite ink, one teal accent for state, dense table-first layout, a stencil display face used sparingly, safety-stripe and crate-label motifs. Siblings to stay away from: Postslot (terracotta, cream, serif), Straightpin (newsprint, yellow highlighter), Inboxwire (ink black, lime), Stepclimb (blue-grey drawing paper, navy, safety orange), Wirebook (mint ledger, forest green), Hotrail (cobalt on white, huge numerals). This brief is the gate for every UI change (docs/factory/DESIGN_PLAYBOOK.md section 1). Light mode only (D-52).

### What changed and what stayed (yard redesign)
- Changed: palette (concrete and graphite with teal, no white page, no black buttons, no lime), type (Saira Stencil for H1 only + IBM Plex Sans + IBM Plex Mono, replacing Archivo, Public Sans and JetBrains Mono), radius (squared: 0, 3, 4, 8), structure (2px graphite rules frame every product object; tables first), motifs (safety stripe, crate label plate), e-mail, OG image, favicons, printable legal page.
- Stayed: the real-product hero (the change sheet table, now under a graphite crate-label header and a safety stripe), section order, all copy and claims, light only, motion rules, 44px targets.

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

## 6. Visual system ("yard")
Concept: a release is a crate moving through a loading yard. Concrete floor, graphite steel, stencilled crate sides, safety stripes at the edge of live zones, and one teal lamp that says "this is moving / this is healthy / press here". Everything important sits in a dense table framed by a 2px graphite rule.

Differs from rivals on palette (concrete and teal, not navy or purple), type (stencil plus Plex, not Inter or Poppins), layout (flat dense tables, not tilted screenshots) and imagery (legible real UI). Differs from every BufferSol sibling: no cream, paper white, newsprint, mint, blue-grey, lime, terracotta, cobalt, navy or orange.

### Palette (role tokens in `src/app/globals.css`, plain hex copy in `src/lib/brand.ts` for mail, OG and favicons)
| Role | Value | Use, contrast (WCAG) |
|---|---|---|
| `surface` | `#E2E5E6` poured concrete | Page background and base sections |
| `surface-raised` | `#F0F2F2` panel concrete | Tables, forms, sheets, the alternate band. Never pure white |
| `surface-sunken` | `#D3D8DA` | Table heads, selected tabs |
| `surface-inverse` | `#1B2125` graphite | Crate label headers, the single dark band |
| `text` | `#1B2125` | 12.9:1 on concrete, 14.5:1 on panel, 11.3:1 on sunken |
| `text-subtle` | `#434C51` | 6.9:1 on concrete, 6.1:1 on sunken |
| `text-muted` | `#4D565B` | 5.9:1 on concrete, 5.2:1 on sunken |
| `text-inverse` / `text-inverse-subtle` | `#F0F2F2` / `#B9C0C3` | On graphite: 14.5:1 / 8.8:1 |
| `border` / `border-strong` | `#B9C0C3` / `#8A9397` | Hairlines; product objects use a 2px `text` rule instead |
| `action` = `accent` = `success` | `#0A625D` teal | Primary buttons (white text 7.2:1), active nav bar, healthy state text (5.7:1 on concrete, 5.0:1 on sunken), ring progress |
| `action-hover` | `#08524E` | White text 9.0:1 |
| `mark` | `#C9E6E2` teal wash | The one row that needs a human, selection, featured plan (graphite text 12.3:1). Used at 40% on rows |
| `focus` | `#063F3C` | 2px ring, 2px offset, 9.3:1 on concrete |
| `warning` / `danger` | `#7F4C00` / `#A51F15` with pale surfaces | State only, always icon plus word, at least 5:1 on every surface |
| `control-border` | `#6C767B` | Input edges, 3.2:1 or better (1.4.11) |

One accent: teal. Graphite is ink, not a button colour. Secondary buttons are panel concrete with a 1px graphite edge.

### Type (next/font, self hosted)
- Display: **Saira Stencil** 600. Only `heading-1` (one per page), the wordmark and the tenant name on crate label headers (`stencil` utility). Reads like a spray-stencilled crate side.
- Text: **IBM Plex Sans** 400/500/600 for every other heading and all interface text. Engineered, slightly technical, very legible in dense tables.
- Mono: **IBM Plex Mono** 400/500, tabular figures, for versions, hashes, counts, times, prices (`figure-lg`/`figure-md` are mono) and `label-caps` column heads.
- Named styles only. No italics, nothing above 600 except the stencil. Inter, Geist, Roboto, Arial remain banned.

### Grid, radius, rules, elevation
- 12 column grid in a 1280px container. Hero: H1 over 8 columns with the crate spec plate in 4, a 2px graphite rule, then copy and CTA, then the change sheet at 12.
- Radius by object: crate labels and chips 0, buttons and inputs 3px, panels and tables 4px, dialogs 8px. No pills.
- Rules: product objects (change sheet, dock, rate sheet, crate spec, manifest label) are framed by a 2px graphite rule; inside them 1px hairlines. Page headers end on a 2px graphite rule.
- No soft shadows; menus and dialogs only.

### Motifs
- **Crate label plate**: graphite or 2px-ruled header strip with a mono caps field name ("CRATE SPEC", "APPS IN <TENANT>") and a stencilled name. Used for the hero spec, the change sheet, the dock table, pricing facts, the 404 tag.
- **Safety stripe** (`hazard` utility): 45 degree graphite bars on concrete, an SVG tile (no gradients). Only at the edge of a live zone: under a crate label header, at the corner of the spec plate, on the 404 page, the OG card. Never as decoration on its own.
- **Teal row bar**: a 4px inset teal bar plus the teal wash marks the row that needs attention (paused ring, selected app, featured plan).

### Pricing
A rate sheet, not cards: one plan per row (Plan, Price, Included in two ruled columns, Start), the featured plan marked with the teal row bar. Reads like a price list on a loading bay wall.

### App UI
- Shell: a 240px panel-concrete rail, stencil wordmark, teal 4px bar on the current item. Page header ends on a 2px graphite rule.
- Dock: KPI strip framed in graphite with mono caps labels; the app table under a graphite crate label header and a safety stripe; selected row gets the teal bar; the manifest is a 2px-ruled crate label.
- Panels: sunken header row, 2px graphite divider, panel body.
- Empty states, loading skeletons, errors, 44px targets and pointer cursors unchanged.

### Imagery, icons, motion
- Real product components with demo data, labelled "Demo data". No illustrations, mascots, stock or emoji. Phosphor icons only where they carry meaning.
- One curve `cubic-bezier(0.22, 1, 0.36, 1)`. The flagged row's teal wash draws in once. Tagline reveal word by word. Plain opacity under reduced motion.

### E-mail, OG, favicon, legal print
- E-mail: concrete background, panel card with a 2px graphite frame and a teal top band, teal button, Plex with system fallback.
- OG/Twitter card: concrete, safety stripe band, crate mark, a graphite-framed crate label holding the tagline, teal foot band.
- Favicon and Apple icon: the braced crate in graphite over a teal dock line on concrete.

## 7. Bans checked on every page
Centred hero over a glow; purple, indigo or default blue accent; one system font everywhere; three identical icon cards; "Everything you need"; emoji or stock art; glassmorphism; one radius everywhere; pill badges; identical section rhythm; invented numbers; "streamline", "seamless", "supercharge".

## 8. Self critique log
Scores per round are in docs/design-qa.md ("Yard identity" section, three rounds); final screenshots in docs/qa/design/.
