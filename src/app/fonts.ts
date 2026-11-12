import { Saira_Stencil, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

/**
 * docs/design-brief.md "yard" identity: Saira Stencil for the few big headlines and the wordmark only,
 * IBM Plex Sans for every word of interface text, IBM Plex Mono for every identifier and figure.
 */
export const display = Saira_Stencil({ subsets: ["latin"], weight: "600", variable: "--font-display", display: "swap" });
export const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap", preload: false });
