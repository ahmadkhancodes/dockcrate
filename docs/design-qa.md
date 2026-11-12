# Design QA scorecard (DESIGN_PLAYBOOK section 9)

## Redesign "change sheet", 12 Nov 2026 (docs/design-brief.md)

Screenshots (light, full page, 1440 and 375) in `docs/qa/design/`: home, pricing, sign-in, catalog QA log, app dock, app dock empty, billing, tenants. Every other route was captured during the loop with `scripts/screenshots-design.ts` (the script reported no horizontal overflow on any capture). Competitor and reference shots in `docs/design/refs/2026-11-12/`.

### Rounds
| Round | Hero (/) | Core app screen (/app dock) | Pricing |
|---|---|---|---|
| 0 (before) | Cream paper, dock green, condensed stencil, dashed crate card beside the copy: reads as the "Claude" palette | 288px icon sidebar, KPI tiles with caps labels, amber tag on every row | Five rounded cards, green ring on the featured plan |
| 1 | Graphite and white, Archivo expanded H1, full width change sheet with the lime mark on the paused row. Problems: H1 wrapped to three lines with empty space on the right; logo glyph read as a pause icon | 240px rail with lime current bar, tenant tabs, ruled KPI strip, app table. Problems: columns misaligned (auto width status cell); amber "Checks 3/4" on every row was noise | One ruled sheet, five columns, featured column on canvas. Problems: "per year" and "For MSPs" wrapped |
| 2 | H1 across the full container on two lines, copy and CTA on 7 columns, ruled spec list on 4; new crate glyph; step 02 of How it works fixed (grid order) | Fixed column tracks; neutral tag when only VM is pending, red only on a failed check; row tag hidden on phones so names stay readable | No wrap on units and the tag |
| 3 | Hero padding tightened; at 375 the sheet shows three rows only (the paused one first) | Sidebar background runs the full page; filter bars and plan cards on white over the canvas | H1 without periods, ruled facts beside it |

### Final scores
| Category | Score | Worst remaining problem |
|---|---|---|
| 1. Message clarity | 5 | none: H1 names the job and the buyer's world ("every Intune tenant"), one primary CTA |
| 2. ICP fit | 5 | none: white and graphite with mono identifiers, unlike the navy, purple and teal field and unlike our old cream |
| 3. Hero and product proof | 5 | none: the real change sheet, legible at 375, labelled Demo data |
| 4. Structure and rhythm | 4 | Long page; the comparison and price strip could merge later |
| 5. Typography | 4 | Expanded H2s still wrap to three lines on a few long questions at 1440 |
| 6. Spacing and radius | 4 | A few legacy app panels still mix p-4 and p-6 |
| 7. Color and contrast | 5 | none: contrast pairs asserted in tests/unit/a11y.test.ts, one lime mark per view |
| 8. Motion and states | 4 | Usage banner shows a warning at exactly 1 of 1 tenants on Free, which is normal use |
| 9. Content honesty | 5 | none: no invented numbers, logos or quotes; demo surfaces labelled |
| 10. Responsive and ship | 4 | Lighthouse not run (no Lighthouse in this runner) |

Total 45/50, no category below 4, no hard fail. Greps: zero `text-[`, `p-[`, `m-[`, `gap-[`, `rounded-[` in src; no gradients, backdrop blur, banned fonts or filler words (asserted in tests/unit/design-system.test.ts).

## Previous: M1-B, 5 Nov 2026 (superseded look)

Screenshots: `docs/qa/` (`/`, `/pricing`, `/security`, `/compare/pckgr`, `/catalog`, `/sign-in`; 375 and 1440; light). Captured from `npm run build && npm start`. `scripts/screenshots.ts` reports zero horizontal overflow on all 24 captures; the e2e test repeats the 375 check on 9 routes.

| Category | Score | Worst problem |
|---|---|---|
| 1. Message clarity | 4 | H1 is long (four lines at 1440); one primary CTA stays above the fold |
| 2. ICP fit | 5 | none: stencilled crate, dock green and amber differ from the navy, purple and gradient field on palette and type |
| 3. Hero and product proof | 4 | At 375 the crate sits below the first screen, behind the CTA and proof strip |
| 4. Structure and rhythm | 4 | Pricing strip on the landing is a plain row, no slider (slider is M5 polish) |
| 5. Typography | 4 | Big Shoulders is condensed, so long H2s read dense; only named styles are used |
| 6. Spacing and radius | 4 | Radii are 2, 4 and 8 only; two spots use fixed rem grid tracks for table columns |
| 7. Color and contrast | 4 | Contrast pairs are by design, not yet CI tested (M5 target) |
| 8. Motion and states | 4 | Reveal and tagline use the kit curve (300 to 700 ms) instead of the 120/180/240 ms DESIGN scale |
| 9. Content honesty | 5 | All demo surfaces say "Demo data"; catalog is labelled sample; VM check shows pending, never claimed |
| 10. Responsive and ship | 4 | 44px targets and no overflow; Lighthouse not run yet |

Total 42/50, no category below 3, no hard fail.

## Greps (all run on `src`)
- `rg "text-\[|p-\[|m-\[|gap-\[|rounded-\["`: no hits.
- `rg "Inter|Roboto|Arial|Helvetica|Open Sans"`: no hits (the Arial Narrow fallback was removed).
- `rg "bg-gradient|linear-gradient"`: no hits (the kit's hero text gradient utility was deleted).
- `rg "ease-in-out|ease-linear|transition-all"`: no hits.
- `rg -i "supercharge|revolutionize|seamless|effortless|unlock"`: no hits.
- `rg 'href="#"'`: no hits.
- `grep -rniE "postslot|web3forms|submission" src`: no hits.
- `rounded-full` appears only on the 8px inspection tag punch hole and the loading spinner (circles, not pills).
- Hex literals remain only in the OG/icon images and the kit's email templates (inline styles are required in email). Email restyle is due with the M3 mail work.

## Residual
- Motion durations still use the kit's 200 to 700 ms values; align to 120/180/240 in M5.
- Lighthouse, CLS and LCP measurement, contrast CI test: M5.

## Yard identity (12 Nov 2026, D-56..D-58), critique against playbook section 8
Shots: docs/qa/design/ (1440 and 375, light, stub mode via scripts/screenshots-design.ts).

- Round 1 (home, pricing, dock at 1440): new palette and type read as a different company from every sibling. Faults: stencil used on every H2 as well as the H1, so it stopped being "sparing"; change sheet rows 57px tall, not dense; pricing kept a five-column card grid with tall single-column inclusion lists (looked like the sibling pricing page). KPI labels in body type broke the label voice.
- Round 2: stencil limited to `heading-1`, the wordmark and crate label names (`heading-2` is Plex Sans); tagline reveal moved to `heading-2`; change sheet rows to 8px padding (about 45px); pricing rebuilt as a rate sheet, one plan per row; KPI labels in mono caps; manifest crate label framed with the 2px graphite rule. Fault left: inclusions still one long column, so rows ran 200px+.
- Round 3: inclusions in two ruled columns (rows about 120 to 160px), Start column narrowed; ring progress uses the teal for reached rings so healthy state reads the same everywhere; selected dock row gets the teal bar. Dock, tenants, billing and settings checked at 1440 and 375: consistent, no overflow reported by the script.
- Scores (out of 5): hierarchy 4, distinctiveness 5, density for the ICP 5, consistency 4, restraint 4.
- Greps: retired hex values, `lime`, Archivo, Public Sans, JetBrains and `font-stretch` have no hits in `src` (enforced by tests/unit/design-system.test.ts).
