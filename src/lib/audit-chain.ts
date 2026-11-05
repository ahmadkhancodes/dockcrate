import { sha256 } from "@/lib/ids";
import type { AuditEntry } from "@/lib/db/types";

/**
 * Tamper evident audit log. Every entry of an organization stores `seq` (1, 2, 3...) and `prevHash`
 * (the `hash` of the entry before it, null for the first), and `hash` = SHA-256 over a canonical encoding of the
 * entry's own fields plus `seq` and `prevHash`. Editing, deleting or reordering an entry breaks the chain from that
 * point on. Entries written before the chain existed have no `hash` and count as "legacy" (they must come first).
 * Limit (documented on the security page): deleting the newest entries cannot be detected from the log alone.
 */
export const GENESIS = null;

const canon = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
};

type Hashable = Pick<AuditEntry, "id" | "orgId" | "actorId" | "action" | "target" | "meta" | "ip" | "at">;

export async function entryHash(e: Hashable, seq: number, prevHash: string | null): Promise<string> {
  return sha256(canon({ seq, prevHash, id: e.id, orgId: e.orgId, actorId: e.actorId ?? null, action: e.action, target: e.target ?? null, meta: e.meta ?? {}, ip: e.ip ?? null, at: e.at.toISOString() }));
}

/** Fills `seq`, `prevHash` and `hash` for the next entry, given the current last entry of the org (or null). */
export async function chainEntry<T extends Hashable>(e: T, last: Pick<AuditEntry, "seq" | "hash"> | null): Promise<T & { seq: number; prevHash: string | null; hash: string }> {
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS;
  return { ...e, seq, prevHash, hash: await entryHash(e, seq, prevHash) };
}

export interface ChainResult {
  ok: boolean;
  /** Entries whose hash was checked. */
  checked: number;
  /** Entries from before the chain was introduced (no hash). */
  legacy: number;
  broken?: { seq: number | null; id: string; reason: "hash_mismatch" | "prev_mismatch" | "gap" | "unchained_after_chain" };
  headHash: string | null;
}

/** `entries` oldest first. */
export async function verifyChain(entries: AuditEntry[]): Promise<ChainResult> {
  let prev: AuditEntry | null = null;
  let checked = 0, legacy = 0;
  for (const e of entries) {
    if (!e.hash || e.seq === undefined) {
      if (prev) return { ok: false, checked, legacy, headHash: prev.hash ?? null, broken: { seq: e.seq ?? null, id: e.id, reason: "unchained_after_chain" } };
      legacy++;
      continue;
    }
    if (e.seq !== (prev?.seq ?? 0) + 1) return { ok: false, checked, legacy, headHash: prev?.hash ?? null, broken: { seq: e.seq, id: e.id, reason: "gap" } };
    if ((e.prevHash ?? null) !== (prev?.hash ?? null)) return { ok: false, checked, legacy, headHash: prev?.hash ?? null, broken: { seq: e.seq, id: e.id, reason: "prev_mismatch" } };
    if ((await entryHash(e, e.seq, e.prevHash ?? null)) !== e.hash) return { ok: false, checked, legacy, headHash: prev?.hash ?? null, broken: { seq: e.seq, id: e.id, reason: "hash_mismatch" } };
    prev = e;
    checked++;
  }
  return { ok: true, checked, legacy, headHash: prev?.hash ?? null };
}
