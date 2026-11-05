import { z } from "zod";
import { acknowledge, listAlertsFor } from "@/lib/alerts";
import { apiCtx } from "@/lib/api/ctx";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const who = (c: Awaited<ReturnType<typeof apiCtx>>) => ({ orgId: c.org.org.id, userId: c.org.user.id, email: c.org.user.email, role: c.org.role });

/** The in-app alert centre: alerts in this member's tenant scope, newest first, with the unread count. */
export const GET = withApi(async () => {
  const c = await apiCtx();
  return json(await listAlertsFor(c.deps, who(c)));
});

/** Acknowledge one alert (`id`) or all visible ones (`id: "all"`). */
export const POST = withApi(async (req) => {
  const c = await apiCtx();
  const { id } = await readJson(req, z.object({ id: z.string().min(1).max(80) }));
  const n = await acknowledge(c.deps, who(c), id);
  return json({ acknowledged: n });
});
