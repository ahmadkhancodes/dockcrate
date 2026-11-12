/**
 * The "yard" palette as plain hex, for places CSS variables cannot reach: e-mail HTML, the printable legal page,
 * the OG image and the favicons. Must match the raw ramp in src/app/globals.css (tests/unit/design-system.test.ts checks it).
 */
export const brand = {
  concrete: "#e2e5e6",
  panel: "#f0f2f2",
  sunken: "#d3d8da",
  rule: "#b9c0c3",
  ruleStrong: "#8a9397",
  ink: "#1b2125",
  inkSubtle: "#434c51",
  teal: "#0a625d",
  tealWash: "#c9e6e2",
} as const;

/** 45 degree safety stripe tile, graphite on concrete, as an SVG data URL. */
export const hazardTile = (size = 12) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${brand.concrete}"/><path d="M${-size / 4} ${size / 4}l${size / 2} ${-size / 2}M0 ${size}L${size} 0M${size * 0.75} ${size * 1.25}l${size / 2} ${-size / 2}" stroke="${brand.ink}" stroke-width="${size * 0.35}"/></svg>`)}`;
