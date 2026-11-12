import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { permissions, qaStages } from "@/content/security";

/** The permission table: 3 Graph permissions, what each allows and what it does not. Stacks as cards on mobile. */
export function PermissionTable() {
  return (
    <div className="overflow-hidden rounded-lg border border-border-strong bg-surface-raised">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">The three Microsoft Graph permissions DockCrate by BufferSol requests</caption>
        <thead className="sr-only md:not-sr-only">
          <tr className="border-b border-border">
            <th scope="col" className="bg-surface px-4 py-3 label-caps font-normal text-text-muted md:w-1/3">Permission</th>
            <th scope="col" className="bg-surface px-4 py-3 label-caps font-normal text-text-muted">What it lets us do</th>
            <th scope="col" className="bg-surface px-4 py-3 label-caps font-normal text-text-muted">What it does not allow</th>
          </tr>
        </thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p.name} className="block border-b border-border last:border-b-0 md:table-row">
              <th scope="row" className="block px-4 pt-4 text-left align-top md:table-cell md:py-4"><code className="caption-2 font-medium text-text">{p.name.split(".").map((part, i) => <span key={i}>{i ? <>.<wbr /></> : null}{part}</span>)}</code></th>
              <td className="block px-4 pt-2 align-top body-6 text-text md:table-cell md:py-4">
                <span className="flex gap-2"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-success" /><span><span className="label-caps block text-text-subtle md:hidden">Allows</span>{p.allows}</span></span>
              </td>
              <td className="block px-4 py-4 align-top body-6 text-text md:table-cell">
                <span className="flex gap-2"><X size={16} aria-hidden className="mt-0.5 shrink-0 text-text-muted" /><span><span className="label-caps block text-text-subtle md:hidden">Does not allow</span>{p.doesNot}</span></span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The QA pipeline: four stations a version passes before it reaches Pilot. */
export function QaPipeline() {
  return (
    <ol className="grid gap-0 overflow-hidden rounded-lg border border-border-strong bg-surface-raised md:grid-cols-4">
      {qaStages.map((s, i) => (
        <li key={s.name} className="flex flex-col gap-2 border-b border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
          <p className="label-caps text-text-subtle"><span className="tnum">{i + 1}</span> of 4</p>
          <p className="heading-6 text-text">{s.name}</p>
          <p className="body-6 text-text-subtle">{s.rule}</p>
        </li>
      ))}
    </ol>
  );
}

const FLOW = [...qaStages.map((s) => s.name.toUpperCase()), "PILOT", "BROAD"];

/** QA pipeline as an SVG: Vendor installer, four checks, then Pilot and Broad rings. Reads left to right; stacks via viewBox scaling. */
export function QaPipelineDiagram() {
  const w = 128, gap = 22, h = 64;
  const total = FLOW.length * w + (FLOW.length - 1) * gap + 2;
  return (
    <figure>
      <svg viewBox={`0 0 ${total} ${h + 56}`} role="img" aria-labelledby="qa-svg-t qa-svg-d" className="h-auto w-full min-w-[56rem] text-text">
        <title id="qa-svg-t">QA pipeline</title>
        <desc id="qa-svg-d">A vendor installer passes four checks in order: hash, signer, scan and VM. A version that fails any check is held. A version that passes goes to the Pilot ring, then to the Broad ring after the delay, unless Pilot failures pause it.</desc>
        {FLOW.map((name, i) => {
          const x = 1 + i * (w + gap);
          const ring = i >= 4;
          return (
            <g key={name}>
              <rect x={x} y={20} width={w} height={h} rx={6} className={ring ? "fill-surface stroke-text" : "fill-surface-raised stroke-border-strong"} strokeWidth={1.5} />
              <text x={x + w / 2} y={20 + h / 2 - 4} textAnchor="middle" className="fill-current" fontSize={14} fontWeight={600} style={{ fontFamily: "var(--font-mono-family)" }}>{name}</text>
              <text x={x + w / 2} y={20 + h / 2 + 14} textAnchor="middle" className="fill-text-subtle" fontSize={11}>{i < 4 ? `check ${i + 1} of 4` : i === 4 ? "0 h" : "after 48 h"}</text>
              {i < FLOW.length - 1 ? <path d={`M${x + w + 3} ${20 + h / 2} H${x + w + gap - 3} m-6 -4 l6 4 l-6 4`} className="fill-none stroke-text-subtle" strokeWidth={1.5} /> : null}
            </g>
          );
        })}
        <text x={1 + 2 * (w + gap)} y={12} className="fill-text-subtle" fontSize={11}>Any failed check holds the version.</text>
        <text x={1 + 4 * (w + gap)} y={h + 42} className="fill-text-subtle" fontSize={11}>Pilot failures over the threshold pause Broad.</text>
      </svg>
      <figcaption className="sr-only">Text version: the four checks are listed above.</figcaption>
    </figure>
  );
}
