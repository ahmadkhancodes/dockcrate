"use client";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { facets, filterCatalog, STATUS_FILTERS } from "@/lib/catalog/filter";
import type { CatalogRow } from "@/lib/catalog/view";
import { CrateMonogram, InspectionTag, passed } from "./crate";
import { passedLabel } from "./labels";

export function CatalogSearch({ rows }: { rows: CatalogRow[] }) {
  const [q, setQ] = useState("");
  const [publisher, setPublisher] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const id = useId();
  const { publishers, categories } = useMemo(() => facets(rows), [rows]);
  const results = useMemo(() => filterCatalog(rows, { q, publisher, category, status }), [q, publisher, category, status, rows]);
  const filtered = !!(q || publisher || category || status);
  const clear = () => { setQ(""); setPublisher(""); setCategory(""); setStatus(""); };
  const sel = "mt-2 min-h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3 body-5 text-text focus-visible:focus-ring";

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-xl">
        <label htmlFor={id} className="label-caps text-text-subtle">Search apps</label>
        <div className="mt-2 flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-3 focus-within:focus-ring">
          <MagnifyingGlass size={16} aria-hidden className="shrink-0 text-text-subtle" />
          <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="7-Zip, Chrome, Zoom" autoComplete="off" className="min-h-11 w-full bg-transparent body-3 text-text placeholder:text-text-muted focus:outline-none" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label htmlFor={`${id}-p`} className="label-caps text-text-subtle">Publisher</label><select id={`${id}-p`} value={publisher} onChange={(e) => setPublisher(e.target.value)} className={sel}><option value="">All publishers</option>{publishers.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div><label htmlFor={`${id}-c`} className="label-caps text-text-subtle">Category</label><select id={`${id}-c`} value={category} onChange={(e) => setCategory(e.target.value)} className={sel}><option value="">All categories</option>{categories.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div><label htmlFor={`${id}-s`} className="label-caps text-text-subtle">Status</label><select id={`${id}-s`} value={status} onChange={(e) => setStatus(e.target.value)} className={sel}><option value="">Any status</option>{STATUS_FILTERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
      </div>
      <p role="status" className="caption-2 text-text-subtle">{results.length} of {rows.length} apps shown</p>
      {results.length === 0 ? (
        <div className="rounded-md border border-border bg-surface-raised p-8">
          <p className="heading-6 text-text">No app matches these filters</p>
          <p className="body-6 mt-2 text-text-subtle">Clear them to see all {rows.length} apps.</p>
          {filtered ? <button type="button" onClick={clear} className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 button-sm text-text hover:bg-surface focus-visible:focus-ring">Clear filters</button> : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface-raised">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Catalog apps with version, last tested date and QA log</caption>
            <thead className="sr-only md:not-sr-only">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 label-caps text-text-subtle">App</th>
                <th scope="col" className="px-4 py-3 label-caps text-text-subtle">Version</th>
                <th scope="col" className="px-4 py-3 label-caps text-text-subtle">Tag</th>
                <th scope="col" className="px-4 py-3 label-caps text-text-subtle">Last tested</th>
                <th scope="col" className="px-4 py-3 label-caps text-text-subtle">QA log</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => (
                <tr key={c.slug} className="block border-b border-border last:border-b-0 md:table-row">
                  <th scope="row" className="block px-4 pt-4 text-left md:table-cell md:py-3">
                    <span className="flex items-center gap-3"><CrateMonogram name={c.name} /><span><span className="block title-4 text-text">{c.name} {c.demo ? <span className="ml-1 rounded-sm border border-border-strong px-1.5 caption-5 font-normal text-text-subtle">Demo data</span> : null}</span><span className="block caption-5 font-normal text-text-subtle">{c.publisher} · {c.category}</span></span></span>
                  </th>
                  <td className="inline-block px-4 pt-3 font-mono caption-2 text-text md:table-cell md:py-3"><span className="label-caps mr-2 font-sans text-text-subtle md:hidden">Version</span>{c.version}</td>
                  <td className="inline-block px-4 pt-3 md:table-cell md:py-3"><InspectionTag checks={c.checks} /><span className="sr-only"> {passedLabel(passed(c.checks))}</span></td>
                  <td className="block px-4 pt-3 font-mono caption-2 text-text-subtle md:table-cell md:py-3"><span className="label-caps mr-2 font-sans md:hidden">Last tested</span>{c.testedAt}</td>
                  <td className="block px-4 py-3 md:table-cell"><Link href={`/catalog/${c.slug}`} className="inline-flex min-h-11 items-center underline underline-offset-4 button-sm text-text hover:text-action focus-visible:focus-ring">Open QA log<span className="sr-only"> for {c.name}</span></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
