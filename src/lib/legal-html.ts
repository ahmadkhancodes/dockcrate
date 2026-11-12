import { product as p } from "@/config/product";
import type { LegalBlock, LegalDoc } from "@/content/legal";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function block(b: LegalBlock): string {
  if (typeof b === "string") return `<p>${esc(b)}</p>`;
  if ("list" in b) return `<ul>${b.list.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  return `<table><thead><tr>${b.table.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/**
 * A standalone, print friendly HTML document for a legal doc (no scripts, no external assets, system fonts).
 * For the DPA it also appends Annex 1 with the sub processors straight from product.ts, so the download can never
 * list a different set than the sub processors page.
 */
export function legalHtml(doc: LegalDoc, opts: { subprocessorAnnex?: boolean } = {}): string {
  const annex = opts.subprocessorAnnex
    ? `<h2>Annex 1: Authorized subprocessors</h2>${block({ table: { head: ["Provider", "Purpose", "Location"], rows: p.subProcessors.map((s) => [s.name, s.purpose, s.location]) } })}`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} · ${esc(p.fullName)}</title>
<style>
body{font:16px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#1b2125;max-width:44rem;margin:2rem auto;padding:0 1rem}
h1{font-size:1.75rem;margin:0 0 .25rem}h2{font-size:1.15rem;margin:2rem 0 .5rem;break-after:avoid}
.meta{color:#434c51;margin:0 0 1.5rem}table{border-collapse:collapse;width:100%;font-size:.95rem}
th,td{border:1px solid #8a9397;padding:.4rem .6rem;text-align:left;vertical-align:top}th{background:#d3d8da}
li{margin:.25rem 0}tr,li{break-inside:avoid}
@media print{body{margin:0;max-width:none;font-size:11pt}a{color:inherit}.noprint{display:none}}
</style></head><body>
<p class="noprint"><a href="javascript:window.print()">Print or save as PDF</a></p>
<h1>${esc(doc.title)}</h1>
<p class="meta">${esc(p.legal.entity)} · ${esc(p.fullName)} · Effective ${esc(p.legal.effectiveDate)}</p>
${doc.sections.map((s) => `<h2>${esc(s.title)}</h2>${s.body.map(block).join("")}`).join("\n")}
${annex}
</body></html>`;
}
