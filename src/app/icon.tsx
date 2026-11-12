import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: the wordmark's braced crate in graphite on concrete, over a teal dock line. */
export function CrateMark({ px }: { px: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: brand.concrete }}>
      <svg width={px} height={px} viewBox="0 0 22 22">
        <rect x="3.25" y="2.75" width="15.5" height="12.5" fill="none" stroke={brand.ink} strokeWidth="2.5" />
        <path d="M3.5 15 18.5 3" stroke={brand.ink} strokeWidth="2" />
        <rect x="1" y="17.5" width="20" height="3" fill={brand.teal} />
      </svg>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<CrateMark px={32} />, { ...size });
}
