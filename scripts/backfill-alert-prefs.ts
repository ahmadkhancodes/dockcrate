/** One-off: gives members who joined before the hooks existed an alert preference row. MONGODB_URI=... npx tsx scripts/backfill-alert-prefs.ts */
import { ensureMemberPrefs } from "../src/lib/alerts";
import { defaultDeps } from "../src/lib/deps";
import { mongoClient } from "../src/lib/db/mongo";
import { product } from "../src/config/product";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.log("MONGODB_URI not set: skipping (memory driver)");
  process.exit(0);
}
(async () => {
  const d = (await mongoClient(uri)).db(process.env.MONGODB_DB ?? product.slug);
  const members = await d.collection("member").find().toArray();
  const rows: { orgId: string; userId: string; email: string; role: string }[] = [];
  for (const m of members) {
    const uid = String(m.userId);
    const u = await d.collection("user").findOne({ $or: [{ id: uid }, { _id: uid as never }] });
    if (u?.email) rows.push({ orgId: String(m.organizationId), userId: uid, email: String(u.email), role: String(m.role) });
  }
  console.log(`prefs ensured for ${await ensureMemberPrefs(await defaultDeps(), rows)} of ${members.length} members`);
  await (await mongoClient(uri)).close();
})().catch((e) => { console.error(e); process.exit(1); });
