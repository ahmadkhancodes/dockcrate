import { docs } from "@/content/docs";
import { legalDocs } from "@/content/legal";
import { product } from "@/config/product";

export const dynamic = "force-static";

export function GET() {
  const u = (path: string) => `${product.url}${path}`;
  const lines = [
    `# ${product.fullName}`,
    "",
    `> ${product.description}`,
    "",
    "## Docs",
    "",
    ...docs.map((d) => `- [${d.title}](${u(`/docs/${d.slug}`)}): ${d.description}`),
    "",
    "## Product",
    "",
    `- [Pricing](${u("/pricing")}): Plans, device limits and education price`,
    `- [Public catalog](${u("/catalog")}): Searchable apps with version history, inspection tag and QA log (demo data until the live pipeline runs)`,
    `- [Security](${u("/security")}): Permission table, QA pipeline, data handling, DPA download and sub processors`,
    `- [Full documentation as one file](${u("/llms-full.txt")}): All docs in markdown`,
    "",
    "## Legal",
    "",
    ...legalDocs.map((d) => `- [${d.title}](${u(`/legal/${d.slug}`)}): ${d.description}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
