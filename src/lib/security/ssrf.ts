import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

// SSRF guard for every outbound request to a user supplied URL (customer webhooks). SECURITY-REVIEW S-2.
// Two layers: a syntactic check when the URL is saved, and a connect time check on the resolved address, so a name
// that resolves (or later re-resolves, DNS rebinding) to an internal address is refused on the socket we actually use.

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, p) => n * 256 + Number(p), 0);
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

/** True for loopback, private, link-local, CGNAT, documentation, multicast and reserved addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return ((n & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
    });
  }
  if (kind === 6) {
    const a = ip.toLowerCase();
    if (a === "::" || a === "::1") return true;
    const mapped = /^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPrivateAddress(mapped[1]!);
    if (/^::ffff:/.test(a) || /^64:ff9b:/.test(a) || /^::[0-9a-f]/.test(a)) return true; // mapped/translated/compatible in hex form
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (first === 0x2001 && parseInt(a.split(":")[1] || "0", 16) === 0x0db8) return true; // documentation
    return false;
  }
  return true; // not an IP at all: never treat as public
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan", ".corp"];

/** Save time check: scheme, no credentials, and a host that is neither a private literal nor an internal name. */
export function isSafeOutboundUrl(raw: string, opts: { allowHttp?: boolean } = {}): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && !(opts.allowHttp && u.protocol === "http:")) return false;
  if (u.username || u.password) return false;
  // WHATWG URL already normalises decimal, hex and short IPv4 forms ("2130706433", "0x7f.1") to dotted quads.
  const h = u.hostname.toLowerCase().replace(/\.+$/, ""); // "localhost." is localhost
  if (!h || h === "localhost" || BLOCKED_SUFFIXES.some((s) => h.endsWith(s)) || !h.includes(".") && isIP(h) === 0) return false;
  const bare = h.startsWith("[") ? h.slice(1, -1) : h;
  if (isIP(bare)) return !isPrivateAddress(bare);
  return true;
}

type LookupFn = typeof dnsLookup;

/** A dns.lookup that fails when any resolved address is private. Used as the socket's `lookup`, so the check and the connect see the same answer. */
export function guardedLookup(resolve: LookupFn = dnsLookup): LookupFn {
  return ((hostname: string, options: unknown, callback: unknown) => {
    const cb = (typeof options === "function" ? options : callback) as (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
    const o = (typeof options === "object" && options ? options : {}) as { all?: boolean; family?: number };
    resolve(hostname, { ...o, all: true }, (err, addrs) => {
      if (err) return cb(err, "", 0);
      const list = addrs as LookupAddress[];
      const bad = list.find((a) => isPrivateAddress(a.address));
      if (!list.length || bad) {
        const e = Object.assign(new Error("blocked_address"), { code: "EBLOCKED" }) as NodeJS.ErrnoException;
        return cb(e, "", 0);
      }
      if (o.all) return cb(null, list);
      cb(null, list[0]!.address, list[0]!.family);
    });
  }) as LookupFn;
}

export interface PinnedResult { status: number }

/**
 * POST with the address check on the connection itself. Never follows redirects, never reads more than the status
 * line and headers (the body is discarded), and gives up after `timeoutMs`.
 */
export function pinnedPost(rawUrl: string, init: { headers: Record<string, string>; body: string; timeoutMs: number; allowHttp?: boolean; resolve?: LookupFn }): Promise<PinnedResult> {
  return new Promise((resolve, reject) => {
    if (!isSafeOutboundUrl(rawUrl, { allowHttp: init.allowHttp })) return reject(Object.assign(new Error("blocked_address"), { code: "EBLOCKED" }));
    const u = new URL(rawUrl);
    const host = u.hostname.startsWith("[") ? u.hostname.slice(1, -1) : u.hostname;
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request({
      protocol: u.protocol, hostname: host, port: u.port || undefined, path: `${u.pathname}${u.search}`, method: "POST",
      headers: { ...init.headers, "content-length": Buffer.byteLength(init.body).toString() },
      lookup: guardedLookup(init.resolve), agent: false, timeout: init.timeoutMs,
    }, (res) => {
      const status = res.statusCode ?? 0;
      res.destroy(); // the receiver's body is never needed: no huge or slow response can hold us
      resolve({ status });
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })), init.timeoutMs);
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
    req.on("close", () => clearTimeout(timer));
    req.end(init.body);
  });
}
