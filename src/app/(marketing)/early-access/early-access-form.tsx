"use client";
import { createElement, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";

const MESSAGES: Record<string, string> = {
  captcha_failed: "The human check did not complete. Wait for the tick, then send again.",
  rate_limited: "Too many requests from your network. Try again in a minute.",
  invalid_email: "Enter a valid work email, like name@company.com.",
  disposable_email: "Use your work email so we can verify your company.",
  invalid_input: "Check the fields and try again.",
};

export function EarlyAccessForm({ plan }: { plan?: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void import("altcha");
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          company: f.get("company"),
          endpoints: f.get("endpoints"),
          note: [plan ? `Plan interest: ${plan}.` : "", String(f.get("note") ?? "")].filter(Boolean).join(" "),
          website: f.get("website"),
          altcha: f.get("altcha"),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(MESSAGES[data.error ?? ""] ?? "We could not send your request. Try again in a moment.");
        return;
      }
      setDone(String(f.get("email")));
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <Notice tone="success" title="You are on the list">We sent a confirmation to {done}. We will write when publishing into your own Intune tenant opens for you.</Notice>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Field label="Work email" htmlFor="ea-email">
        <Input id="ea-email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="name@company.com" />
      </Field>
      <Field label="Company" htmlFor="ea-company">
        <Input id="ea-company" name="company" autoComplete="organization" required maxLength={120} />
      </Field>
      <Field label="Windows endpoints you manage" htmlFor="ea-endpoints" hint="An estimate across all your tenants is fine.">
        <Input id="ea-endpoints" name="endpoints" type="number" inputMode="numeric" min={1} required placeholder="250" />
      </Field>
      <Field label="Anything we should know? (optional)" htmlFor="ea-note">
        <Textarea id="ea-note" name="note" maxLength={1000} />
      </Field>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {createElement("altcha-widget", { challenge: "/api/altcha", name: "altcha", auto: "onsubmit" })}
      {error ? <p role="alert" className="caption-2 text-danger">{error}</p> : null}
      <Button type="submit" loading={busy}>{busy ? "Sending" : "Get early access"}</Button>
    </form>
  );
}
