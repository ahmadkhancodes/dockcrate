// Ad readiness: honest cadence copy, the early-access gate, the lead form, spam protection and the founder leads page.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CADENCE_MODE, cadence, earlyAccessCopy, product } from "@/config/product";
import { docs } from "@/content/docs";
import { DAILY_SEQUENCE, cronJobs, dailyRun } from "@/lib/cron/jobs";
import { createMemoryDb } from "@/lib/db/memory";
import type { Deps } from "@/lib/deps";
import { earlyAccessOpen, primaryCta } from "@/lib/early-access";
import { leadsCsv, listLeads, saveLead, type Lead } from "@/lib/leads";
import { newChallenge } from "@/lib/security/altcha";
import vercel from "../../vercel.json";

const sent: { to: string; subject: string }[] = [];
let deps: Deps;
let email: string | null = null;

vi.mock("@/lib/deps", () => ({ defaultDeps: async () => deps }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => null,
  requireUser: async () => ({ user: { email } }),
  isFounderAdmin: (e: string | null | undefined) => e === "founder@buffersoltech.com",
}));

beforeEach(() => {
  sent.length = 0;
  email = "founder@buffersoltech.com";
  deps = { db: createMemoryDb("dockcrate"), graph: {} as never, sendMail: async (m) => { sent.push({ to: m.to, subject: m.subject }); }, baseUrl: "https://dockcrate.test", now: () => new Date("2026-11-10T10:00:00Z") };
  vi.unstubAllEnvs();
});

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const publicText = () => [...walk("src/content"), ...walk("src/components/marketing"), ...walk("src/app/(marketing)")].filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("catalog-seed")).map((f) => readFileSync(f, "utf8")).join("\n");
const docsText = () => JSON.stringify(docs);

describe("cadence matches the copy", () => {
  it("the scheduler fits Vercel Hobby: at most two daily entries", () => {
    const crons = vercel.crons as { path: string; schedule: string }[];
    expect(crons.length).toBeLessThanOrEqual(2);
    for (const c of crons) expect(c.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
    for (const j of DAILY_SEQUENCE) expect(cronJobs[j]).toBeTypeOf("function");
  });

  it("the public copy uses the cadence constant and claims nothing faster while it is daily", () => {
    const text = docsText();
    expect(text).toContain(cadence.ringReadSentence);
    expect(text).toContain(cadence.ringPauseWhen);
    expect(text).toContain("retried by the daily run");
    if (CADENCE_MODE === "daily") {
      const all = publicText() + text;
      for (const bad of [/every minute/i, /within (about )?a minute/i, /within minutes/i, /every hour/i, /hourly/i, /real[- ]time/i, /\d+ min(ute)?s? ago/i, /retries every/i]) {
        expect(all, String(bad)).not.toMatch(bad);
      }
      expect(cadence.ringCheck).toBe("once a day");
    } else {
      expect(cadence.ringCheck).toBe("every minute");
    }
  });

  it("the daily run loops every job and stops starting new ones when the budget is spent", async () => {
    const ran: string[] = [];
    const orig = { ...cronJobs };
    for (const j of DAILY_SEQUENCE) cronJobs[j] = async () => { ran.push(j); return "ok"; };
    let t = 0;
    const out = await dailyRun(100, () => (t += 60));
    Object.assign(cronJobs, orig);
    expect(ran.length).toBeGreaterThan(0);
    expect(ran.length).toBeLessThan(DAILY_SEQUENCE.length);
    expect(Object.values(out).some((v) => (v as { skipped?: string })?.skipped === "time_budget")).toBe(true);
  });
});

describe("early-access flag", () => {
  it("is open without ENTRA_CLIENT_ID, or with EARLY_ACCESS=1, and closed otherwise", () => {
    expect(earlyAccessOpen({} as never)).toBe(true);
    expect(earlyAccessOpen({ ENTRA_CLIENT_ID: "abc" } as never)).toBe(false);
    expect(earlyAccessOpen({ ENTRA_CLIENT_ID: "abc", EARLY_ACCESS: "1" } as never)).toBe(true);
  });
  it("switches the primary call to action", () => {
    expect(primaryCta(true)).toEqual({ href: "/early-access", label: "Get early access" });
    expect(primaryCta(false).href).toBe("/sign-in");
    expect(earlyAccessCopy.pricingCta).toBe("Join early access");
  });

  it("sign-in with the flag on: no Microsoft button, no stub text, email link first, one friendly line", async () => {
    const { SignInForm } = await import("@/app/(auth)/sign-in/sign-in-form");
    const form = renderToStaticMarkup(createElement(SignInForm, { callbackURL: "/app", earlyAccess: true }));
    const page = renderToStaticMarkup(await (await import("@/app/(auth)/sign-in/page")).default({ searchParams: Promise.resolve({}) }));
    for (const html of [form, page]) {
      expect(html).not.toMatch(/stub|not configured in this environment|local testing/i);
      expect(html).not.toContain("Sign in with Microsoft");
      expect(html).toContain("Email me a sign-in link");
    }
    expect(page).toContain("Microsoft work-account sign-in opens with early access. Use an email link meanwhile.");
  });

  it("sign-in with Entra configured is unchanged", async () => {
    vi.stubEnv("ENTRA_CLIENT_ID", "abc");
    const { SignInForm } = await import("@/app/(auth)/sign-in/sign-in-form");
    expect(renderToStaticMarkup(createElement(SignInForm, { callbackURL: "/app", earlyAccess: false }))).toContain("Sign in with Microsoft");
  });

  it("no visible stub text is left in the app sources", () => {
    const src = walk("src/app").concat(walk("src/components")).filter((f) => /\.tsx$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(src).not.toMatch(/Stub mode|not configured in this environment/);
  });

  it("pricing buttons read Join early access when the flag is on", async () => {
    const { PricingTable } = await import("@/components/marketing/pricing-table");
    const html = renderToStaticMarkup(createElement(PricingTable, { earlyAccess: true }));
    expect(html).toContain("Join early access");
    expect(html).toContain("/early-access");
  });
});

async function post(body: Record<string, unknown>, ip = "1.1.1.1") {
  const { POST } = await import("@/app/api/early-access/route");
  return POST(new Request("https://dockcrate.test/api/early-access", { method: "POST", headers: { "content-type": "application/json", origin: "https://dockcrate.test", "x-forwarded-for": ip }, body: JSON.stringify(body) }), undefined as never);
}
async function proof() {
  const challenge = await newChallenge();
  const solution = await solveChallenge({ challenge, deriveKey } as never);
  return btoa(JSON.stringify({ challenge, solution }));
}
const valid = { email: "Dana@Acme-MSP.com", company: "Acme MSP", endpoints: 420, note: "Three tenants" };

describe("early-access form", () => {
  it("stores the lead and sends the confirmation and the notification", async () => {
    const res = await post({ ...valid, altcha: await proof() });
    expect(res.status).toBe(200);
    const leads = await listLeads(deps);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ email: "dana@acme-msp.com", company: "Acme MSP", endpoints: 420 });
    expect(sent.map((m) => m.to).sort()).toEqual(["contact@buffersoltech.com", "dana@acme-msp.com"]);
  }, 30_000);

  it("rejects a missing, garbage or replayed ALTCHA proof and stores nothing", async () => {
    expect((await post(valid)).status).toBe(400);
    expect((await post({ ...valid, altcha: "garbage" })).status).toBe(400);
    const p = await proof();
    expect((await post({ ...valid, altcha: p })).status).toBe(200);
    expect((await post({ ...valid, email: "x@acme-msp.com", altcha: p })).status).toBe(400);
    expect(await listLeads(deps)).toHaveLength(1);
  }, 30_000);

  it("a filled honeypot looks like success but stores nothing", async () => {
    const res = await post({ ...valid, website: "http://spam", altcha: await proof() });
    expect(res.status).toBe(200);
    expect(await listLeads(deps)).toHaveLength(0);
    expect(sent).toHaveLength(0);
  }, 30_000);

  it("rejects invalid input, disposable email and cross-site posts", async () => {
    expect((await post({ ...valid, endpoints: 0 })).status).toBe(400);
    expect((await post({ ...valid, email: "a@mailinator.com", altcha: await proof() })).status).toBe(400);
    const { POST } = await import("@/app/api/early-access/route");
    const evil = await POST(new Request("https://dockcrate.test/api/early-access", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.test" }, body: JSON.stringify(valid) }), undefined as never);
    expect(evil.status).toBe(403);
  }, 30_000);

  it("is rate limited per IP", async () => {
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await post({ ...valid, altcha: "x" }, "9.9.9.9")).status;
    expect(last).toBe(429);
  });

  it("a repeat request updates the lead without a second pair of emails", async () => {
    await saveLead(deps, { ...valid, altcha: undefined } as never);
    await saveLead(deps, { ...valid, endpoints: 500 } as never);
    expect(await listLeads(deps)).toHaveLength(1);
    expect((await listLeads(deps))[0]!.endpoints).toBe(500);
    expect(sent).toHaveLength(2);
  });
});

describe("founder leads admin", () => {
  const lead = (id: string, at: string, company: string): Lead => ({ id, email: `${id}@x.com`, company, endpoints: 10, note: "=cmd", createdAt: new Date(at) });

  it("lists leads newest first and exports CSV with formula injection defused", async () => {
    const col = deps.db.collection<Lead>("leads");
    await col.put(lead("a", "2026-11-01T00:00:00Z", "Older"));
    await col.put(lead("b", "2026-11-09T00:00:00Z", "Newer"));
    const html = renderToStaticMarkup(await (await import("@/app/admin/leads/page")).default());
    expect(html.indexOf("Newer")).toBeLessThan(html.indexOf("Older"));
    expect(html).toContain("Export CSV");
    const { GET } = await import("@/app/api/admin/leads/route");
    const res = await GET(new Request("https://dockcrate.test/api/admin/leads"), undefined as never);
    const csv = await res.text();
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(csv.split("\r\n")[1]).toContain("Newer");
    expect(csv).toContain("'=cmd");
    expect(leadsCsv([]).trim()).toBe("created_utc,email,company,windows_endpoints,note");
  });

  it("is hidden from everyone but founders", async () => {
    email = "someone@else.com";
    const { GET } = await import("@/app/api/admin/leads/route");
    expect((await GET(new Request("https://dockcrate.test/api/admin/leads"), undefined as never)).status).toBe(404);
  });
});

describe("indexes", () => {
  it("the leads collection is indexed", () => {
    expect(readFileSync("src/lib/db/mongo.ts", "utf8")).toMatch(/ix\("dc_leads", \{ app: 1, createdAt: -1 \}\)[\s\S]*ix\("dc_leads", \{ app: 1, email: 1 \}, \{ unique: true \}\)/);
    expect(product.supportEmail).toBe("contact@buffersoltech.com");
  });
});
