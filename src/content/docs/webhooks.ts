import { cadence, product as p } from "@/config/product";
import type { DocPage } from "./types";

export const webhooks: DocPage = {
  slug: "webhooks",
  title: "Webhooks",
  description: `Receive signed organization events from ${p.fullName} at your own endpoint and verify them.`,
  sections: [
    {
      heading: "Overview",
      body: [
        "Any plan can add webhooks today. Add an endpoint URL in Settings, then Webhooks. You can add up to 20 endpoints, each subscribed to named events or to *. We send an HTTP POST with a JSON body each time a subscribed event happens. Each endpoint has its own signing secret, shown once when you create it.",
      ],
    },
    {
      heading: "Events",
      body: [
        "Each delivery body is JSON with id, type, created (Unix time) and data. Today we send billing.updated (data: the Stripe event name, plan and status), member.invited (data: invitationId, email, role and invitedBy) and test.ping (from Send test, data: a message). Ring, rollback and QA events are planned.",
      ],
    },
    {
      heading: "Headers",
      body: [
        "Every delivery carries three headers. x-webhook-id is a unique ID for the event, so you can deduplicate. x-webhook-event is the event name. x-webhook-signature proves the request came from us.",
        "The signature looks like t=<unix>,v1=<hex>, where t is the Unix time we signed and v1 is the hex encoded HMAC SHA256 of the string t, a dot, then the raw request body, using the endpoint secret as the key.",
      ],
    },
    {
      heading: "Verify a signature in Node",
      body: [
        "Use the raw body, not a re serialized one. Compare in constant time and reject old timestamps to stop replays.",
      ],
      code: {
        lang: "js",
        code: `import crypto from "node:crypto";

export function verify(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(t + "." + rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`,
      },
    },
    {
      heading: "Responding",
      body: [
        "Return any 2xx status within 10 seconds to acknowledge. Do slow work after you respond. Any other status, or a timeout, counts as a failure.",
      ],
    },
    {
      heading: "Retries",
      body: [
        `${cadence.webhookRetry} After the last attempt the delivery is marked failed, and you can replay it from the dashboard.`,
      ],
    },
  ],
};
