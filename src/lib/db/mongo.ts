import { MongoClient, type Collection, type Db as MongoDatabase, type Document } from "mongodb";
import { chainEntry } from "@/lib/audit-chain";
import { uuidv7 } from "@/lib/ids";
import { log } from "@/lib/logger";
import { DELIVERY_TTL_DAYS, type AuditEntry, type Collection as AppCollection, type BillingAccount, type Db, type Entitlement, type Suppression, type WebhookDelivery, type WebhookEndpoint } from "./types";

// Ported from trayo server/db/mongo.ts. Changes: global singleton client (Vercel), pool 10, Date TTLs,
// stripe events recorded after success, no sync/family/anonymous. Use only from runtime = "nodejs" routes.

declare global {
  var __kitMongo: { uri: string; client: Promise<MongoClient> } | undefined;
}

export function mongoClient(uri: string): Promise<MongoClient> {
  if (globalThis.__kitMongo?.uri === uri) return globalThis.__kitMongo.client;
  const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000, appName: "buffersol-kit" }).connect();
  globalThis.__kitMongo = { uri, client };
  client.catch(() => {
    if (globalThis.__kitMongo?.client === client) globalThis.__kitMongo = undefined;
  });
  return client;
}

type WithId<T> = T & { _id: string };

export function createMongoDb(uri: string, dbName: string, app: string): Db {
  let dbp: Promise<MongoDatabase> | null = null;
  const db = () => (dbp ??= mongoClient(uri).then((c) => {
    const d = c.db(dbName);
    void scheduleIndexes(d, `${uri}|${dbName}`); // not awaited: never delays or fails a request
    return d;
  }));
  const col = async <T extends Document>(name: string) => (await db()).collection<T>(name) as unknown as Collection<T>;
  const strip = <T>(d: (T & { _id?: unknown; app?: string }) | null): T | null => {
    if (!d) return null;
    const { _id: _i, ...rest } = d as Record<string, unknown>;
    return rest as T;
  };

  return {
    app,
    collection<T extends { id: string }>(name: string): AppCollection<T> {
      const c = () => col<Document>(`dc_${name}`);
      const out = (d: Document | null) => (d ? (strip<T>(d as never)) : null);
      return {
        async get(id) {
          return out(await (await c()).findOne({ _id: id as never, app }));
        },
        async find(filter = {}) {
          const rows = await (await c()).find({ ...(filter as Document), app }).toArray();
          return rows.map((r) => out(r) as T);
        },
        async put(doc) {
          await (await c()).replaceOne({ _id: doc.id as never }, { ...doc, app } as Document, { upsert: true });
        },
        async delete(id) {
          await (await c()).deleteOne({ _id: id as never, app });
        },
        async insertIfAbsent(doc) {
          try {
            await (await c()).insertOne({ ...doc, _id: doc.id as never, app } as Document);
            return true;
          } catch (e) {
            if ((e as { code?: number }).code === 11000) return false;
            throw e;
          }
        },
        async claim(id, expect, patch) {
          const filter: Document = { _id: id as never, app };
          for (const [k, v] of Object.entries(expect)) filter[k] = v ?? null; // null also matches a missing field
          return out(await (await c()).findOneAndUpdate(filter, { $set: patch as Document }, { returnDocument: "after" }));
        },
      };
    },
    async getBillingAccount(id) {
      return strip<BillingAccount>(await (await col<WithId<BillingAccount>>("billing_accounts")).findOne({ _id: id, app }));
    },
    async upsertBillingAccount(a) {
      const { createdAt, ...rest } = a;
      await (await col<WithId<BillingAccount>>("billing_accounts")).updateOne(
        { _id: a.id },
        { $set: { ...rest, app }, $setOnInsert: { createdAt: createdAt ?? new Date() } },
        { upsert: true },
      );
    },
    async findBillingAccountByCustomer(c) {
      return strip<BillingAccount>(await (await col<WithId<BillingAccount>>("billing_accounts")).findOne({ app, stripeCustomerId: c }));
    },
    async getEntitlement(id) {
      const d = await (await col<WithId<Entitlement & { app: string }>>("entitlements")).findOne({ _id: id, app });
      if (!d) return null;
      const { _id: _i, app: _a, ...rest } = d;
      return rest as Entitlement;
    },
    async setEntitlement(id, e) {
      await (await col<WithId<Entitlement & { app: string }>>("entitlements")).replaceOne({ _id: id }, { ...e, app }, { upsert: true });
    },
    async hasStripeEvent(id) {
      return !!(await (await col<{ _id: string }>("stripe_events")).findOne({ _id: id }, { projection: { _id: 1 } }));
    },
    async markStripeEvent(id, type) {
      try {
        // expireAt (Date) lets Mongo TTL drop rows after Stripe's 30 day retry horizon.
        await (await col<{ _id: string; app: string; type: string; at: Date; expireAt: Date }>("stripe_events")).insertOne({
          _id: id, app, type, at: new Date(), expireAt: new Date(Date.now() + 35 * 864e5),
        });
        return true;
      } catch (e) {
        if ((e as { code?: number }).code === 11000) return false;
        throw e;
      }
    },
    async incUsage(orgId, meter, period, by = 1) {
      const r = await (await col<{ _id: string; app: string; orgId: string; meter: string; period: string; value: number }>("usage")).findOneAndUpdate(
        { _id: `${orgId}|${meter}|${period}` },
        { $inc: { value: by }, $setOnInsert: { app, orgId, meter, period } },
        { upsert: true, returnDocument: "after" },
      );
      return r?.value ?? by;
    },
    async getUsage(orgId, meter, period) {
      const d = await (await col<{ _id: string; value: number }>("usage")).findOne({ _id: `${orgId}|${meter}|${period}` });
      return d?.value ?? 0;
    },
    async hitRateLimit(key, windowMs, now = Date.now()) {
      // One atomic pipeline update: drop hits outside the window, push this one, bump the TTL Date.
      const r = await (await col<{ _id: string; hits: number[]; expireAt: Date }>("rate_limits")).findOneAndUpdate(
        { _id: `${app}:${key}` },
        [
          {
            $set: {
              hits: {
                $concatArrays: [
                  { $filter: { input: { $ifNull: ["$hits", []] }, as: "h", cond: { $gt: ["$$h", now - windowMs] } } },
                  [now],
                ],
              },
              expireAt: new Date(now + windowMs),
            },
          },
        ],
        { upsert: true, returnDocument: "after" },
      );
      return r?.hits.length ?? 1;
    },
    async appendAudit(e) {
      const base: AuditEntry = { ...e, id: uuidv7(), app, at: e.at ?? new Date() };
      const c = await col<WithId<AuditEntry>>("audit_log");
      if (!base.orgId) {
        await c.insertOne({ _id: base.id, ...base });
        return base;
      }
      // Chained append: the unique {app, orgId, seq} index makes a concurrent writer fail, then we re-read the head and retry.
      for (let attempt = 0; ; attempt++) {
        const last = await c.find({ app, orgId: base.orgId, seq: { $exists: true } }).sort({ seq: -1 }).limit(1).next();
        const entry = await chainEntry(base, last ? strip<AuditEntry>(last) : null);
        try {
          await c.insertOne({ _id: entry.id, ...entry });
          return entry;
        } catch (err) {
          if ((err as { code?: number }).code !== 11000 || attempt >= 8) throw err;
        }
      }
    },
    async auditChain(orgId) {
      const docs = await (await col<WithId<AuditEntry>>("audit_log")).find({ app, orgId }).sort({ seq: 1, at: 1 }).toArray();
      return docs.map((d) => strip<AuditEntry>(d)!);
    },
    async listAudit(orgId, { limit = 50, before } = {}) {
      const docs = await (await col<WithId<AuditEntry>>("audit_log"))
        .find({ app, orgId, ...(before ? { at: { $lt: before } } : {}) })
        .sort({ at: -1 })
        .limit(Math.min(limit, 200))
        .toArray();
      return docs.map((d) => strip<AuditEntry>(d)!);
    },
    async createWebhookEndpoint(e) {
      const ep: WebhookEndpoint = { ...e, app, createdAt: new Date() };
      await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).insertOne({ _id: ep.id, ...ep });
      return ep;
    },
    async listWebhookEndpoints(orgId) {
      const docs = await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).find({ app, orgId }).sort({ createdAt: 1 }).toArray();
      return docs.map((d) => strip<WebhookEndpoint>(d)!);
    },
    async getWebhookEndpoint(orgId, id) {
      return strip<WebhookEndpoint>(await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).findOne({ _id: id, orgId, app }));
    },
    async updateWebhookEndpoint(orgId, id, patch) {
      await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).updateOne({ _id: id, orgId, app }, { $set: patch });
    },
    async deleteWebhookEndpoint(orgId, id) {
      await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).deleteOne({ _id: id, orgId, app });
    },
    async createDelivery(d) {
      await (await col<WithId<WebhookDelivery>>("webhook_deliveries")).insertOne({ _id: d.id, ...d, app });
    },
    async updateDelivery(id, patch) {
      await (await col<WithId<WebhookDelivery>>("webhook_deliveries")).updateOne({ _id: id, app }, { $set: patch });
    },
    async listDeliveries(orgId, { endpointId, limit = 50 } = {}) {
      const docs = await (await col<WithId<WebhookDelivery>>("webhook_deliveries"))
        .find({ app, orgId, ...(endpointId ? { endpointId } : {}) })
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 200))
        .toArray();
      return docs.map((d) => strip<WebhookDelivery>(d)!);
    },
    async getDelivery(orgId, id) {
      return strip<WebhookDelivery>(await (await col<WithId<WebhookDelivery>>("webhook_deliveries")).findOne({ _id: id, orgId, app }));
    },
    async dueDeliveries(now, limit) {
      const docs = await (await col<WithId<WebhookDelivery>>("webhook_deliveries"))
        .find({ app, status: { $in: ["pending", "retrying"] }, nextAttemptAt: { $lte: now } })
        .sort({ nextAttemptAt: 1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => strip<WebhookDelivery>(d)!);
    },
    async addSuppression(s) {
      const email = s.email.toLowerCase();
      await (await col<WithId<Suppression & { app: string }>>("suppressions")).updateOne(
        { _id: `${app}:${email}|${s.scope}` },
        { $set: { email, reason: s.reason, scope: s.scope, at: s.at ?? new Date(), app } },
        { upsert: true },
      );
    },
    async isSuppressed(email, scope = "all") {
      const e = email.toLowerCase();
      return !!(await (await col<{ _id: string }>("suppressions")).findOne({ _id: { $in: [`${app}:${e}|all`, `${app}:${e}|${scope}`] } }));
    },
    async removeSuppression(email, scope = "all") {
      await (await col<{ _id: string }>("suppressions")).deleteOne({ _id: `${app}:${email.toLowerCase()}|${scope}` });
    },
    async getConfig() {
      const docs = await (await col<{ _id: string; value: string; app: string }>("config")).find({ app }).toArray();
      return Object.fromEntries(docs.map((d) => [d._id.replace(`${app}:`, ""), d.value]));
    },
    async setConfig(k, v) {
      await (await col<{ _id: string; value: string; app: string }>("config")).updateOne({ _id: `${app}:${k}` }, { $set: { value: v, app } }, { upsert: true });
    },
    async exportOrgData(orgId) {
      const [billingAccount, entitlement, endpoints, auditLog] = await Promise.all([
        this.getBillingAccount(orgId),
        this.getEntitlement(orgId),
        this.listWebhookEndpoints(orgId),
        this.listAudit(orgId, { limit: 200 }),
      ]);
      return { billingAccount, entitlement, webhookEndpoints: endpoints.map(({ secret: _s, ...rest }) => rest), auditLog };
    },
    async deleteOrgData(orgId) {
      const d = await db();
      await d.collection("billing_accounts").deleteOne({ _id: orgId as never });
      await d.collection("entitlements").deleteOne({ _id: orgId as never });
      await d.collection("usage").deleteMany({ app, orgId });
      await d.collection("webhook_endpoints").deleteMany({ app, orgId });
      await d.collection("webhook_deliveries").deleteMany({ app, orgId });
    },
  };
}

/** Index creation for a database handle. TTLs are on Date fields. Conflicting existing indexes (codes 85/86) are logged, not thrown. */
export async function createAllIndexes(d: MongoDatabase) {
  const ix = async (name: string, keys: Document, opts: Document = {}) => {
    try {
      await d.collection(name).createIndex(keys as never, opts);
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code !== 85 && code !== 86) throw e;
      log.warn("index conflict, left as is", { collection: name, code: String(code) });
    }
  };
  await ix("billing_accounts", { app: 1, stripeCustomerId: 1 }, { unique: true, partialFilterExpression: { stripeCustomerId: { $type: "string" } } });
  await ix("stripe_events", { expireAt: 1 }, { expireAfterSeconds: 0 });
  await ix("rate_limits", { expireAt: 1 }, { expireAfterSeconds: 0 });
  await ix("usage", { app: 1, orgId: 1, period: 1 });
  await ix("audit_log", { app: 1, orgId: 1, at: -1 });
  await ix("audit_log", { app: 1, orgId: 1, seq: 1 }, { unique: true, partialFilterExpression: { seq: { $type: "number" } } });
  await ix("webhook_endpoints", { app: 1, orgId: 1 });
  await ix("webhook_deliveries", { app: 1, orgId: 1, createdAt: -1 });
  await ix("webhook_deliveries", { app: 1, status: 1, nextAttemptAt: 1 });
  await ix("webhook_deliveries", { expireAt: 1 }, { expireAfterSeconds: 0 });
  await ix("suppressions", { app: 1, email: 1 });
  // DockCrate domain collections (documents carry `app` and `id` = _id)
  await ix("dc_tenants", { app: 1, orgId: 1, entraTenantId: 1 }, { unique: true, partialFilterExpression: { entraTenantId: { $type: "string" } } });
  await ix("dc_deployments", { app: 1, tenantId: 1, idempotencyKey: 1 }, { unique: true });
  await ix("dc_deployments", { app: 1, state: 1 });
  await ix("dc_catalog_versions", { app: 1, appSlug: 1 });
  await ix("dc_tenant_apps", { app: 1, tenantId: 1, appSlug: 1 }, { unique: true });
  await ix("dc_alerts", { app: 1, orgId: 1, createdAt: -1 });
  // Better Auth collections
  await ix("user", { email: 1 }, { unique: true });
  await ix("session", { token: 1 }, { unique: true });
  await ix("session", { expiresAt: 1 }, { expireAfterSeconds: 0 });
  await ix("verification", { identifier: 1 });
  await ix("verification", { expiresAt: 1 }, { expireAfterSeconds: 0 });
  await ix("member", { organizationId: 1, userId: 1 }, { unique: true });
  await ix("organization", { slug: 1 }, { unique: true });
  await ix("apikey", { key: 1 });
  return DELIVERY_TTL_DAYS;
}

/** Manual path (npm run db:indexes). */
export async function ensureIndexes(uri: string, dbName: string) {
  return createAllIndexes((await mongoClient(uri)).db(dbName));
}

declare global {
  var __kitIndexes: Map<string, Promise<void>> | undefined;
}

/**
 * Fire-and-forget, once per server instance and database. Never throws, never awaited by requests.
 * Skipped during `next build`. A failure is logged (scrubbed) and retried on the next cold start.
 */
export function scheduleIndexes(d: MongoDatabase, key: string): Promise<void> | undefined {
  if (process.env.NEXT_PHASE === "phase-production-build") return undefined;
  const memo = (globalThis.__kitIndexes ??= new Map());
  const hit = memo.get(key);
  if (hit) return hit;
  const p = createAllIndexes(d).then(
    () => undefined,
    (e) => log.warn("auto index creation failed", { code: String((e as { code?: unknown }).code ?? "unknown"), name: (e as Error)?.name }),
  );
  memo.set(key, p);
  return p;
}
