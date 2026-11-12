# DESIGN: DockCrate by BufferSol

> **Superseded on 12 Nov 2026 by `docs/design-brief.md`** (the "change sheet" system: white and graphite, signal lime mark, Archivo expanded + Public Sans + JetBrains Mono). The research notes below stay for history; the palette, type and crate/stencil visuals in sections 4 and 5 no longer apply.

Status: Phase 0, awaiting orchestrator approval. Proof: `docs/design/mock.html` (+ `mock-1440.png`, `mock-375.png`). Rebuild the mock with `python3 docs/design/tools/build-mock.py <fontsource dir>`.
Always write the full name "DockCrate by BufferSol" in copy. The wordmark may show "DockCrate" with "by BufferSol" beneath.

## 1. Competitor and ICP research (live sites, 5 Nov 2026)
Screenshots at 1440 and 375 are in `docs/design/refs/`. Measured with Playwright (computed styles).

| Site | Hero claim | Hero visual | Palette / type | What it tells us |
|---|---|---|---|---|
| Pckgr | "Application management. Your way." | Two cartoon mascots with laptops | Navy `#0E131B`, cyan-to-green gradient headline, purple CTA; Inter 700 | Category default: dark navy + gradient + mascot. Copy-led, FAQ wall, "Book a walkthrough" as the only CTA. Nothing on the page shows the product. |
| Robopack | "Meet the Future of Intune Patching" | Tilted, perspective-skewed dashboard shots; big enterprise logo strip | Deep purple `#120C28`, periwinkle CTA; Barlow 600 | Dark purple glow, floating UI, borrowed-credibility logos. UI is shown but too small to read. |
| Packer | "Vendors ship. Packer packages. Intune deploys." | A clean, legible app table (apps, versions, status pills) | White + mint wash, ink `#151A23`, green accent, pill buttons; Manrope 800 | The best of the field: shows the product, states the price under the CTA. Still rounded-pill SaaS. |
| IntuneGet | "Deploy any Windows app to Intune. Search it, ship it." | Live packaging pipeline with Prepare/Install/Detect/Uninstall/Verify steps | Slate + teal, Inter 800; search box in the hero | Developer-tool look. The live public QA pipeline is the right instinct and the one thing worth matching in spirit. |
| Patch My PC | Pricing matrix first | Enterprise table | Dark navy header, Poppins | Enterprise density, minimum prices. Speaks to a different buyer. |
| Microsoft EAM (Fluent) | n/a | Intune blade UI | Grey panels, blue `#0078D4` | This is the interface our ICP lives in all day. We must not imitate it (brief) but must be as legible as it. |

Category cliches, shared by nearly everyone: blue/purple/teal on navy or white, gradient headline, rounded cards and pills, Inter-class sans, stock "robot/box" mascots, claims with no visible evidence. Nobody shows *why a version is safe* on the page.

**Gap we own:** the evidence. Every version carries a visible inspection tag and a QA log you can open without logging in. The look is a stencilled, inspected, concrete-and-amber loading dock instead of another dark dashboard.

## 2. ICP card
Mike, owner-technician of a 3 to 40 person MSP (Ohio), 15 to 60 client tenants on Business Premium, 500 to 1,500 devices. Reads r/msp and r/Intune on a desk with three monitors and again on his phone between client sites. Buys with a card up to about $1,200 a year; his lead tech reads the Graph permission list before he does. Fears: a bad update breaking 400 machines, another vendor holding write access to every tenant, a tool that vanishes. Uses Intune, Autopilot, Defender, an RMM, and Pckgr/IntuneGet/Patch My PC. He distrusts adjectives and trusts numbers, logs and a specific permission list. Words: Win32 app, .intunewin, detection rule, supersedence, ring, tenant, Required/Available.
Secondary: Priya, a one-person IT department; Dan, UK IT lead; Sam, school IT coordinator (needs a calm, readable UI with larger touch targets).

## 3. Positioning
For MSPs and lean IT teams on Intune without Enterprise App Management, who lose hours repackaging Chrome, Zoom and 7-Zip for every tenant, DockCrate by BufferSol is the Intune app packaging service that hash-checks, scans and test-installs every version and ships it through Pilot and Broad rings with one-click rollback, unlike tools that publish untested winget packages or lock multi-tenant and rollback behind $99 to $149 plans.

Layout type: **A, classic hero plus sections**, with a type-D comparison page for each rival. Reason: the product is understandable from one real UI crop and the buyer arrives from search/Reddit already knowing the problem.

## 4. Visual system (concept: "the loading dock")
Each app version is a **crate** with a stencilled label (name, version, architecture, SHA-256 prefix) and an **inspection tag** with four punched checks: Hash, Signer, Scan, VM. Rings are **bays** (Bay 1 Pilot, Bay 2 Broad). Shipping moves a crate one bay right. Rollback is "return to dock". Mood: inspected, stencilled, calm, legible, accountable.
Signature move: the crate label + inspection tag. It appears in the hero (real component), in the app (CrateRow, ManifestPanel), on public catalog pages and in emails. It is ownable because it is also the product's evidence.

### Palette (semantic role tokens; CSS variables switch by `data-theme` / `prefers-color-scheme`)
| Role | Light | Dark ("night shift") | Notes |
|---|---|---|---|
| `--primary` dock green | `#1F5C4A` (hover `#174838`) | `#4FAE8C` | White text on light primary = 8.0:1; `#0E1412` text on dark primary |
| `--accent` inspection amber | `#E3A21A` | `#F0B23A` | **Black text only** (`#14181C`). Used for tags, focus ring. Never for body text |
| `--ink` | `#14181C` | `#E8E6E1` | |
| `--ink-muted` | `#5A626A` | `#9AA3A9` | 5.9:1 on concrete (AA) |
| `--surface` concrete | `#F6F5F2` | `#15191C` | Flat background, no gradients |
| `--raised` | `#FFFFFF` | `#1D2327` | Cards, tables, panels |
| `--border` | `#D6D3CC` | `#2E363B` | 1px all round or not at all |
| `--soft` | `#EAF1EE` | `#1B2A26` | Selected row, subtle fills |
| `--success` | `#1E7A46` | `#4FBF7F` | Status is always icon + label, never colour alone |
| `--warning` | `#B26A00` | `#E0A04A` | |
| `--error` | `#B42318` | `#F0766B` | |
| `--info` steel | `#2F5D8A` | `#7FA9D6` | |
Raw ramps (10 shades) for green, amber and neutral are generated from these anchors in `src/styles/tokens.css`. Dark-mode backgrounds deliberately override the playbook's whitelist (`#15191C`, `#1D2327`): the brief mandates "night shift", and the ICP is a warm-dark-room reader, not a pure-black developer. Recorded as a playbook override.
Contrast pairs to test in CI: ink on surface, ink-muted on surface, on-primary on primary, on-accent on accent, each status colour on raised.
The lone allowed gradient (hero heading text) is **not used**: the headline is solid ink with one green word.

### Type pair (Google Fonts via `next/font`, self-hosted at build; no runtime font CDN)
- Display: **Big Shoulders Display** 600/800 (headings, KPIs, wordmark). Condensed, industrial, readable at 56px and 20px.
- Stencil: **Big Shoulders Stencil Display** 800, **only** on crate labels.
- Body/UI: **Atkinson Hyperlegible Next** 400/600/700 (built for low-vision legibility, which also suits a 36px dense table). Fallback: Segoe UI.
- Mono: **IBM Plex Mono** 400/500, `font-variant-numeric: tabular-nums` for versions, hashes, counts.
Playbook override: the playbook's font whitelist (Geist/Manrope/Poppins) and 900-weight ban are replaced for this ICP; we use 800 max. Inter, Roboto, Arial, Open Sans, Helvetica remain banned. Three families plus one stencil face are justified because each has one job.

### Scale
| Style | Size / line | Weight / face |
|---|---|---|
| display-xl | 56/56 (mobile 36/40) | Display 800 |
| h1 | 40/44 | Display 800 |
| h2 | 30/36 (24/30 in app) | Display 800 |
| h3 | 18/24 | Display 800, uppercase +0.04em for panel titles |
| body | 15/22 (17/26 for marketing lead text) | Atkinson 400 |
| small | 13/18 | Atkinson 400/600 |
| mono | 13/18 | Plex Mono 400 |
| label | 11/14 uppercase +0.08em | Atkinson 600 |
Tailwind v4 `@theme` defines only these named sizes; arbitrary `text-[..]` is banned by lint.

### Radius, spacing, elevation, motion
- Radius: 2 / 4 / 8 (mostly square). Tag radius 4 with a 6px punched hole. Crate label: 2px dashed border. Pills (999px) are banned.
- Spacing: 4px base. Allowed: 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96. Section padding 80 to 96 desktop, 48 to 64 mobile.
- Elevation: flat. `shadow-1: 0 1px 0`, `shadow-2: 0 8px 24px rgb(0 0 0 / .12)` for menus and the manifest drawer only.
- Motion: 120 / 180 / 240 ms, one easing curve. Crate slides one bay right in 180 ms; tag "stamps" (scale 1.06 to 1) in 120 ms; the mandatory tagline reveal (playbook B11) activates word by word. Everything is disabled under `prefers-reduced-motion`.
- Focus ring: 2px amber with 2px offset. Touch targets 44px. Breakpoints 640 / 768 / 1024 / 1440.

### Density, iconography, imagery
- Density: marketing medium (one idea per band, 1200px container, hero copy max 680px); app medium-high (36px rows, 12 to 14 apps visible at 1440x900).
- Icons: Lucide, 1.75px stroke, square caps (the brief names Lucide; Phosphor/Solar/Iconamoon are allowed alternatives but a single set keeps it coherent) plus six custom glyphs: crate, tag, bay, return, seal, tenant.
- Imagery: no stock photos, no mascots, no cargo cartoons. Real product components (never empty states) and 1px line drawings of crate labels and tags on concrete. Data viz: bay tracks (segmented bars), small-multiple sparklines, a stepped exposure line. Status is always icon + label.
- Components: CrateRow, BayTrack, InspectionTag, CrateLabel, ManifestPanel, StatusChip, TenantSwitcher, KpiTile.

### Voice
Calm senior Intune engineer. Numbers over adjectives. Sentence case. No exclamation marks. Errors say what failed and what to do next ("Microsoft asked us to slow down (HTTP 429). We'll retry automatically at 14:32."). Microsoft is referenced only as "Works with Microsoft Intune". Never disparage competitors; every comparison states name, price, source and check date.

## 5. Do / Don't
Do
- Show the QA log, the permission list and the price in the first two screens.
- Put the product (crate, bay track, manifest) in the hero as a coded component with believable, non-round demo data, labelled "Demo data".
- Keep one primary CTA above the fold: "Start free with Microsoft".
- Use mono for every version, hash and count; right-align numbers.
- Provide empty/loading/error states for every list with a next action.
Don't
- Purple/blue gradients, glassmorphism, glows, blur.
- Inter / Space Grotesk / Segoe UI as the brand font; emoji section markers; AI sparkle icons; cream + terracotta.
- Identical rounded three-card grids, mascots, confetti, cute forklifts, sound.
- Fluent blade layouts or `#0078D4`; Pckgr's logo, lettering or colours.
- Colour-only status; fake logos, fake testimonials, invented stats ("10,000+ teams").
- Hyphens inside body copy and headings; orphan last words (use `text-wrap: balance` / `pretty`).

## 6. Why this fits the ICP better than the competitors
1. **It argues with evidence, not adjectives.** The three rivals who show UI hide the safety story; IntuneGet shows a pipeline but as a generic dev-tool card. The crate + tag turns "hash-checked, scanned, test-installed" into something Mike can click and read, which is what his lead tech needs before granting Graph access.
2. **It is legible at technician density.** Atkinson Hyperlegible and a 36px mono-aligned table read better on a three-monitor desk and on a phone at a client site than Inter/Manrope pills. The mobile view is read-mostly with "Roll back" and "Pause all" always reachable.
3. **It does not look like Intune or like Pckgr.** Square, stencilled, concrete and amber against their navy/purple/teal gradients and mascots; the green is a deliberately dark "dock green" (not Packer's mint) and amber is reserved for inspection.
4. **Trust by restraint.** Flat surfaces, no glow, hairline borders, honest comparison pages and a visible permission table match a buyer who reads a security review before a card.
5. **Accessible by default** (WCAG 2.2 AA targets, 44px targets, status never by colour alone), which matters for school and government-adjacent buyers.

## 7. Scorecard targets (M5)
Run the DESIGN_PLAYBOOK scorecard at 375 and 1440 in light. Targets: contrast pairs all AA, zero arbitrary type/spacing values, Lighthouse 90+ (performance, accessibility, SEO), CLS under 0.05, hero LCP under 2.0 s on mobile (fonts preloaded, no web-font CDN).

## 8. Open points for the orchestrator
- Dock green `#1F5C4A` sits near Packer's green family. Mitigation: it is far darker and paired with amber and concrete, never mint. If you want more separation, swap to the runner-up "steel teal" with no other change (one token edit).
- The demo preview uses illustrative tenants ("Halvorsen Dental"); every instance is labelled "Demo data".
