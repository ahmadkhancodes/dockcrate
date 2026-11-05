import { Big_Shoulders, Big_Shoulders_Stencil, Atkinson_Hyperlegible_Next, IBM_Plex_Mono } from "next/font/google";

// DockCrate type system (docs/DESIGN.md): display, body/UI, mono. Self-hosted at build.
export const display = Big_Shoulders({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display", display: "swap" });
export const sans = Atkinson_Hyperlegible_Next({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-body", display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
export const stencil = Big_Shoulders_Stencil({ subsets: ["latin"], weight: ["800"], variable: "--font-stencil", display: "swap" });
