import { ImageResponse } from "next/og";
import { product } from "@/config/product";
import { brand, hazardTile } from "@/lib/brand";

export const alt = `${product.fullName}: ${product.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card in the yard language: concrete, a safety stripe, a crate label plate with the claim. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: brand.concrete, color: brand.ink, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: 24, backgroundImage: `url("${hazardTile(24)}")`, backgroundSize: "24px 24px", borderBottom: `4px solid ${brand.ink}` }} />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: 72 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="56" height="56" viewBox="0 0 22 22">
              <rect x="3.25" y="2.75" width="15.5" height="12.5" fill="none" stroke={brand.ink} strokeWidth="2.5" />
              <path d="M3.5 15 18.5 3" stroke={brand.ink} strokeWidth="2" />
              <rect x="1" y="17.5" width="20" height="3" fill={brand.teal} />
            </svg>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{product.name}</div>
            <div style={{ fontSize: 24, color: brand.inkSubtle }}>by BufferSol</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", border: `4px solid ${brand.ink}`, background: brand.panel }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 24px", background: brand.ink, color: brand.panel, fontSize: 22, letterSpacing: 2, textTransform: "uppercase" }}>
              <span>Crate label</span>
              <span>{product.host}</span>
            </div>
            <div style={{ display: "flex", padding: "28px 24px", fontSize: 60, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5 }}>{product.tagline}</div>
            <div style={{ display: "flex", height: 10, background: brand.teal }} />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
