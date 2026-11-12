import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { safeNext, afterSignIn } from "@/components/app/redirect";
import { guardedLookup, isPrivateAddress, isSafeOutboundUrl, pinnedPost } from "@/lib/security/ssrf";
import { isSafeWebhookUrl, attemptDelivery } from "@/lib/webhooks/outbound";
import { scopeOrgExport } from "@/lib/account-export";
import { can } from "@/lib/auth/roles";
import { RULES } from "@/lib/security/ratelimit";
import { csvCell } from "@/lib/audit-export";

// Exploit regressions for docs/SECURITY-REVIEW.md. Each case failed before its fix.

describe("S-1 open redirect through control characters in ?next", () => {
  it.each(["/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", "/ /evil.example", "/\u0000/evil.example", "//evil.example", "/\\evil.example", "https://evil.example"])("%j falls back to /app", (n) => {
    expect(safeNext(n)).toBe("/app");
    expect(afterSignIn({ next: n })).toBe("/app");
  });
  it("keeps real paths", () => {
    expect(safeNext("/app/rings/t1?x=1")).toBe("/app/rings/t1?x=1");
    expect(safeNext("/accept-invite/abc")).toBe("/accept-invite/abc");
  });
});

describe("S-2 SSRF in customer webhooks", () => {
  it.each([
    "https://localhost./h", "https://LOCALHOST.:3100/h", "https://0.0.0.0/h", "https://100.100.100.200/h", "https://2130706433/h", "https://0x7f.1/h",
    "https://metadata.google.internal./x", "https://intranet/x", "https://[::ffff:127.0.0.1]/x", "https://[fd00::1]/x", "https://user:pw@hooks.example.com/",
    "https://198.18.0.1/", "https://printer.lan/", "https://169.254.169.254./latest",
  ])("refuses %s at save time", (u) => {
    expect(isSafeWebhookUrl(u)).toBe(false);
  });
  it("accepts public https hosts", () => {
    expect(isSafeOutboundUrl("https://hooks.example.com/x")).toBe(true);
    expect(isSafeOutboundUrl("https://8.8.8.8/x")).toBe(true);
    expect(isSafeOutboundUrl("http://hooks.example.com/x")).toBe(false);
  });
  it("classifies addresses", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.31.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fe80::1", "fc00::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "224.0.0.1"]) expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(a), a).toBe(false);
  });

  const fakeResolve = (addrs: string[]) => ((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
    cb(null, addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })))) as never;

  it("refuses a public looking name that resolves to a private address (DNS rebinding included)", async () => {
    const lookup = guardedLookup(fakeResolve(["93.184.216.34", "127.0.0.1"]));
    const err = await new Promise<NodeJS.ErrnoException | null>((r) => (lookup as unknown as (h: string, o: object, cb: (e: NodeJS.ErrnoException | null) => void) => void)("rebind.example.com", {}, r));
    expect(err?.code).toBe("EBLOCKED");
  });

  it("never connects to a loopback server behind a hostname", async () => {
    let hits = 0;
    const srv = http.createServer((_q, s) => { hits++; s.end("ok"); });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as AddressInfo).port;
    try {
      await expect(pinnedPost(`http://rebind.example.com:${port}/`, { headers: {}, body: "{}", timeoutMs: 2000, allowHttp: true, resolve: fakeResolve(["127.0.0.1"]) })).rejects.toMatchObject({ code: "EBLOCKED" });
      expect(hits).toBe(0);
    } finally { srv.close(); }
  });

  it("a stored endpoint that became unsafe is not delivered to", async () => {
    let called = false;
    const db = { updateDelivery: async () => {} } as never;
    const d = { id: "d1", attempts: 0, event: "test.ping", payload: "{}" } as never;
    const r = await attemptDelivery(d, { id: "e", url: "https://localhost./x", secret: "s" } as never, { db, fetchFn: (async () => { called = true; return new Response("ok"); }) as typeof fetch });
    expect(called).toBe(false);
    expect(r.lastError).toBe("blocked_address");
  });
});

describe("S-3 sign-in mail brake", () => {
  it("caps links per address and per IP", () => {
    expect(RULES.authEmail.limit).toBeLessThanOrEqual(5);
    expect(RULES.authIp.limit).toBeLessThanOrEqual(20);
  });
});

describe("S-4 data export follows role and tenant scope", () => {
  const data = {
    billingAccount: { stripeCustomerId: "cus_1" }, entitlement: { plan: "free" }, webhookEndpoints: [{ id: "w" }],
    auditLog: [{ id: "a1", meta: { tenantId: "t1" }, ip: "1.2.3.4" }, { id: "a2", meta: { tenantId: "t2" } }, { id: "a3" }],
  };
  it("viewer gets no audit, billing account or webhooks", () => {
    expect(scopeOrgExport(data, { role: "viewer", tenantScope: "all" })).toEqual({});
  });
  it("scoped operator gets only in-scope audit rows and no billing account", () => {
    const out = scopeOrgExport(data, { role: "operator", tenantScope: ["t1"] });
    expect((out.auditLog as { id: string }[]).map((e) => e.id)).toEqual(["a1", "a3"]);
    expect(out.billingAccount).toBeUndefined();
  });
  it("owner gets everything", () => {
    const out = scopeOrgExport(data, { role: "owner", tenantScope: "all" });
    expect(out.billingAccount).toEqual(data.billingAccount);
    expect(out.auditLog).toHaveLength(3);
  });
});

describe("S-5 organisation API key permissions match the Better Auth plugin", () => {
  it("owners and admins may create, update and delete; operators and viewers may not", () => {
    for (const a of ["create", "update", "delete"]) {
      expect(can("owner", "apiKey", a)).toBe(true);
      expect(can("admin", "apiKey", a)).toBe(true);
      expect(can("operator", "apiKey", a)).toBe(false);
      expect(can("viewer", "apiKey", a)).toBe(false);
    }
  });
});

describe("S-7 CSV formula injection bypasses", () => {
  it.each([" =HYPERLINK(\"http://evil\")", " =1+1", "＝1+1", "|calc!A0", "%0A=1", "\n=1", "=1", "+1", "-1", "@SUM(A1)"])("%j is neutralised", (v) => {
    expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("leaves ordinary text alone", () => {
    expect(csvCell("Northwind MSP")).toBe("Northwind MSP");
    expect(csvCell("7-Zip 24.08")).toBe("7-Zip 24.08");
  });
});
