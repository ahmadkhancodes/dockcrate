import { Archivo, Public_Sans, JetBrains_Mono } from "next/font/google";

/** docs/design-brief.md: Archivo expanded for display, Public Sans for text, JetBrains Mono for every identifier and figure. */
export const display = Archivo({ subsets: ["latin"], weight: "variable", axes: ["wdth"], variable: "--font-display", display: "swap" });
export const sans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
