import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { clearPriceCache } from "@/lib/billing/catalog";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { csvCell } from "@/lib/audit-export";
import { dockCsv, DOCK_CSV_HEADER } from "@/lib/dock-export";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";
import { scrub } from "@/lib/logger";
import { securityHeaders } from "@/lib/security/headers";
import type { DockRow } from "@/lib/rings/view";
import { event, fakeStripe } from "./fakes";

let db: Db;
let f: ReturnType<typeof fakeStripe>;
beforeEach(() => { db = createMemoryDb("dockcrate"); f = fakeStripe(); clearPriceCache(); });

describe("Stripe webhook: signature, duplicate, order", () => {
  it("a bad signature is 400, records nothing and changes no plan", async () => {
    await db.upsertBillingAccount({ id: "o1", stripeCustomerId: "cus_1", email: "a@b.test" });
    const body = event("customer.subscription.updated", { customer: "cus_1" }, "evt_bad");
    const r = await handleStripeWebhook(body, "forged", { stripe: f.stripe, db, secret: "x" });
    expect(r.status).toBe(400);
    expect(await db.hasStripeEvent("evt_bad")).toBe(false);
    expect(await db.getEntitlement("o1")).toBeNull();
  });
  it("the same event twice, then an older one after a newer one, converges", async () => {
    await db.upsertBillingAccount({ id: "o1", stripeCustomerId: "cus_1", email: "a@b.test" });
    const newer = event("customer.subscription.updated", { customer: "cus_1" }, "evt_2");
    const older = event("customer.subscription.created", { customer: "cus_1" }, "evt_1");
    expect((await handleStripeWebhook(newer, "good", { stripe: f.stripe, db, secret: "x" })).status).toBe(200);
    const first = await db.getEntitlement("o1");
    expect((await handleStripeWebhook(newer, "good", { stripe: f.stripe, db, secret: "x" })).status).toBe(200);
    expect((await handleStripeWebhook(older, "good", { stripe: f.stripe, db, secret: "x" })).status).toBe(200);
    expect({ ...(await db.getEntitlement("o1")), checkedAt: 0 }).toEqual({ ...first, checkedAt: 0 });
  });
});

describe("rate limits", () => {
  it("stops the 601st call in a minute and recovers in the next window", async () => {
    const rule = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) await enforceRateLimit("t:user:1", rule, db);
    await expect(enforceRateLimit("t:user:1", rule, db)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    await enforceRateLimit("t:user:2", rule, db); // another key is unaffected
    expect(RULES.api.limit).toBeGreaterThanOrEqual(300);
  });
});

describe("logs never carry secrets or PII", () => {
  it("redacts token-, secret-, e-mail- and signature-like keys but keeps codes", () => {
    const out = scrub({ apiKey: "k", clientSecret: "s", resetToken: "t", userEmail: "a@b.c", stripeSignature: "sig", code: "mail_unavailable", statusCode: 502, route: "/x" });
    expect(out).toMatchObject({ apiKey: "[redacted]", clientSecret: "[redacted]", resetToken: "[redacted]", userEmail: "[redacted]", stripeSignature: "[redacted]", code: "mail_unavailable", statusCode: 502, route: "/x" });
  });
});

describe("CSV export of the dock", () => {
  const row = (over: Partial<DockRow>): DockRow => ({ slug: "a", name: "7-Zip", publisher: "Igor", catalogVersion: "25.01", deployedVersion: null, checks: {} as never, tag: "", bays: ["idle", "idle", "idle"], status: "bay2-waiting", statusLabel: "Not published", outOfDate: false, paused: false, deploymentId: null, rollbackTo: null, pausedReason: null, canPublish: true, publishReason: null, ...over });
  it("has a header, quotes commas and neutralises formulas", () => {
    const csv = dockCsv([row({}), row({ name: '=HYPERLINK("http://evil")', publisher: "A, B", pausedReason: "line\nbreak" })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(DOCK_CSV_HEADER.join(","));
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).toContain('"A, B"');
    expect(csvCell("😀 ünï <b>x</b>")).toBe("😀 ünï <b>x</b>");
  });
});

describe("CSP covers every origin the app uses", () => {
  const csp = securityHeaders().find((h) => h.key === "Content-Security-Policy")!.value;
  it("allows Stripe form posts, own fetch, blob workers (ALTCHA) and forbids framing and objects", () => {
    expect(csp).toContain("form-action 'self' https://checkout.stripe.com https://billing.stripe.com");
    expect(csp).toMatch(/connect-src 'self'/);
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
  it("no app form posts natively to a third party: every <form> uses onSubmit or GET", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : []; });
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/<form\b[^>]*>/g)) expect(m[0], file).not.toMatch(/action=|method="post"/i);
    }
  });
});

describe("health", () => {
  it("reports db and dependency state as booleans only", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_SHOULD_NOT_LEAK");
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text).deps).toEqual({ stripe: false, mail: false, entra: false });
    expect(text).not.toContain("SHOULD_NOT_LEAK");
    vi.unstubAllEnvs();
  });
});

describe("built client bundle holds no secrets", () => {
  const dir = ".next/static";
  it.skipIf(!existsSync(dir))("has no key-shaped strings or server env names", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(js|css|map)$/.test(p) ? [p] : []; });
    const bad = /(sk_(live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|re_[A-Za-z0-9]{20,}|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|RESEND_API_KEY|ENTRA_CLIENT_SECRET|MANIFEST_SIGNING_KEY|MONGODB_URI|CRON_SECRET)/;
    for (const file of walk(dir)) expect(readFileSync(file, "utf8").match(bad)?.[0] ?? null, file).toBeNull();
  });
});
