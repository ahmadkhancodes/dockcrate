import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ created: 0, fail: null as null | { code?: number } }));
vi.mock("mongodb", () => {
  const coll = { createIndex: async () => { state.created++; if (state.fail) throw Object.assign(new Error("boom"), state.fail); } };
  class MongoClient {
    connect() { return Promise.resolve({ db: () => ({ collection: () => coll }) }); }
  }
  return { MongoClient };
});

async function open(uri = "mongodb://x/a") {
  const { createMongoDb } = await import("@/lib/db/mongo");
  const db = createMongoDb(uri, "d", "dockcrate");
  await db.getConfig().catch(() => undefined);
  await new Promise((r) => setTimeout(r, 10));
}

describe("auto indexes", () => {
  beforeEach(() => {
    state.created = 0; state.fail = null;
    globalThis.__kitIndexes = undefined; globalThis.__kitMongo = undefined;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("runs once and not again on a second connection", async () => {
    await open();
    const n = state.created;
    expect(n).toBeGreaterThan(10);
    await open();
    expect(state.created).toBe(n);
  });

  it("is skipped during next build", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await open();
    expect(state.created).toBe(0);
  });

  it("is skipped for the memory driver", async () => {
    vi.stubEnv("MONGODB_URI", "");
    vi.stubEnv("DB_DRIVER", "memory");
    globalThis.__kitMemoryDb = undefined;
    const { getDb } = await import("@/lib/db");
    await (await getDb()).getConfig();
    expect(state.created).toBe(0);
  });

  it("an index error does not break the db", async () => {
    state.fail = { code: 13 };
    await expect(open()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it("conflicts are logged, not thrown", async () => {
    state.fail = { code: 85 };
    await open();
    expect(console.warn).toHaveBeenCalled();
  });
});
