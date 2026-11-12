"use client";
import { useSyncExternalStore } from "react";

/** "unknown" until the check returns. Marketing HTML is static and renders the signed-out state, so unknown behaves like out. */
export type SessionState = "unknown" | "in" | "out";

let state: SessionState = "unknown";
let started = false;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: { user?: unknown } | null) => set(s && s.user ? "in" : "out"))
    .catch(() => set("out"));
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => listeners.delete(l);
}

/** Cheap, shared (one request per page load) session check for static marketing pages. */
export function useSessionState(): SessionState {
  return useSyncExternalStore(subscribe, () => state, () => "unknown" as SessionState);
}
