"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";

interface Result { ok: boolean; checked: number; legacy: number; headHash: string | null; broken?: { seq: number | null; id: string; reason: string } }

const REASON: Record<string, string> = {
  hash_mismatch: "an entry was edited after it was written",
  prev_mismatch: "an entry was removed or reordered",
  gap: "an entry is missing from the sequence",
  unchained_after_chain: "an unsigned entry appears after the chain started",
};

export function VerifyChainButton() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/audit/verify", { method: "POST" });
      if (!r.ok) throw new Error();
      setRes(await r.json());
    } catch { setErr("The check could not run. Try again."); }
    setBusy(false);
  }
  return (
    <div className="mb-6 flex flex-col gap-3">
      <div><Button variant="secondary" onClick={run} loading={busy}>Verify chain</Button></div>
      {err ? <p role="alert" className="caption-2 text-danger">{err}</p> : null}
      {res ? (
        <div role="status">
          {res.ok
            ? <Notice tone="success" title="Chain intact">{res.checked} entries verified{res.legacy ? `, ${res.legacy} older entries predate the chain` : ""}. Head {res.headHash ? res.headHash.slice(0, 12) : "none"}.</Notice>
            : <Notice tone="danger" title="Chain broken">Entry {res.broken?.seq ?? "?"} ({res.broken?.id}): {REASON[res.broken?.reason ?? ""] ?? "does not match"}. {res.checked} earlier entries verified.</Notice>}
        </div>
      ) : null}
    </div>
  );
}
