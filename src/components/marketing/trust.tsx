import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { permissions, qaStages } from "@/content/security";

/** The permission table: 3 Graph permissions, what each allows and what it does not. Stacks as cards on mobile. */
export function PermissionTable() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface-raised">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">The three Microsoft Graph permissions DockCrate by BufferSol requests</caption>
        <thead className="sr-only md:not-sr-only">
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-3 label-caps text-text-subtle md:w-1/4">Permission</th>
            <th scope="col" className="px-4 py-3 label-caps text-text-subtle">What it lets us do</th>
            <th scope="col" className="px-4 py-3 label-caps text-text-subtle">What it does not allow</th>
          </tr>
        </thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p.name} className="block border-b border-border last:border-b-0 md:table-row">
              <th scope="row" className="block px-4 pt-4 text-left align-top md:table-cell md:py-4"><code className="break-all caption-1 text-text">{p.name}</code></th>
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

/** The QA pipeline: four stations a version passes before it reaches Bay 1. */
export function QaPipeline() {
  return (
    <ol className="grid gap-0 border border-border bg-surface-raised md:grid-cols-4">
      {qaStages.map((s, i) => (
        <li key={s.name} className="flex flex-col gap-2 border-b border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
          <p className="label-caps text-text-subtle"><span className="tnum">{i + 1}</span> of 4</p>
          <p className="heading-5 uppercase text-text">{s.name}</p>
          <p className="body-6 text-text-subtle">{s.rule}</p>
        </li>
      ))}
    </ol>
  );
}
