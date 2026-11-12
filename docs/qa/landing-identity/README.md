# Landing identity and library compliance (12 Nov 2026)

Before/after at 375 and 1440, light: `home-before-*.png`, `home-after-*.png` (full page), `*-fold.png` (first screen), `home-after-375-menu.png` (mobile panel), `pricing-after-*.png`. Regenerate with `node scripts/qa-landing-shots.mjs http://localhost:3100 after docs/qa/landing-identity` against `next start`.

## Uniqueness proof

| | DockCrate ("yard") |
|---|---|
| Palette | concrete `#E2E5E6` page, `#F0F2F2` panels, `#D3D8DA` sunken, graphite ink `#1B2125`, single teal `#0A625D` (action and healthy), teal wash `#C9E6E2`, warning `#7F4C00`, danger `#A51F15` |
| Fonts | Saira Stencil 600 (heading-1 and wordmark only), IBM Plex Sans 400/500/600, IBM Plex Mono 400/500 |
| Radius feel | squared: chips 0, controls 3px, panels 4px, dialogs 8px; 2px graphite rules around product objects |
| Layout type | A (classic hero plus sections): high intent IT buyers comparing Pckgr and Robopack want the claim, price and a real product view first, then proof |
| Hero composition | left stencil claim over 8 columns, "Crate spec" plate with a safety stripe on the right, graphite rule, then the full width change sheet (real component, demo data) |
| Signature element | safety stripe tiles and crate label plates; the paused row in a teal ring with a "Roll back" stamp |

Differs from the others: the only one on cool concrete grey with a stencil display face and squared industrial plates, where Postslot is warm paper and stamps, Wirebook a green ledger, Hotrail navy rails, Stepclimb a blueprint, Inboxwire white API docs and Straightpin newsprint.

## Measured (local `next start`, Lighthouse 12 mobile, Chromium)
- `/`: performance 95 to 98 over four runs, accessibility 96 (muted tagline words, D-64).
- `/pricing`: performance 95 to 99, accessibility 100.
- Hero h1 680px wide at 1440 (was 733px), subheading 680px; every rendered font size on the scale (12, 14, 16, 18, 20, 24, 30, 36, 48, 60); no horizontal overflow at 375.
- Tagline reveal in Chromium: all 13 words at 0.30 on load, then lit in reading order while scrolling (3, 6, 9, 13), all at 1.0 under reduced motion.
