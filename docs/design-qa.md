# Design QA scorecard (DESIGN_PLAYBOOK section 9), M1-B, 5 Nov 2026

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
