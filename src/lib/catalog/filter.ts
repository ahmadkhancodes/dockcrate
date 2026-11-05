import type { CatalogRow } from "./view";

export interface CatalogFilter { q?: string; publisher?: string; category?: string; status?: string }

export const STATUS_FILTERS = [
  { value: "inspected", label: "Inspected 4/4" },
  { value: "static", label: "Static checks only" },
  { value: "held", label: "Held" },
  { value: "candidate", label: "Candidate" },
] as const;

/** Maps a version status to the public status filter value. */
export function statusKey(s: CatalogRow["status"]): string {
  return s === "verified" ? "inspected" : s === "verified_static" ? "static" : s === "revoked" ? "held" : s;
}

/** Pure list filter for the public catalog. Search matches name, publisher and category; the facets are exact matches. */
export function filterCatalog(rows: CatalogRow[], f: CatalogFilter): CatalogRow[] {
  const t = f.q?.trim().toLowerCase();
  return rows.filter((r) =>
    (!t || `${r.name} ${r.publisher} ${r.category}`.toLowerCase().includes(t)) &&
    (!f.publisher || r.publisher === f.publisher) &&
    (!f.category || r.category === f.category) &&
    (!f.status || statusKey(r.status) === f.status));
}

export function facets(rows: CatalogRow[]) {
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return { publishers: uniq(rows.map((r) => r.publisher)), categories: uniq(rows.map((r) => r.category)) };
}
