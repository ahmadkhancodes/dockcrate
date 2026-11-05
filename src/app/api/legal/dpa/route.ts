import { getLegalDoc } from "@/content/legal";
import { legalHtml } from "@/lib/legal-html";

/** Print friendly DPA. `?download=1` sends it as a file. Public, no login. */
export function GET(req: Request) {
  const dpa = getLegalDoc("dpa")!;
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(legalHtml(dpa, { subprocessorAnnex: true }), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(download ? { "content-disposition": 'attachment; filename="dockcrate-dpa.html"' } : {}),
      "cache-control": "public, max-age=3600",
    },
  });
}
