/** Events a customer endpoint can subscribe to. Every name here is really emitted somewhere (tests/unit/usefulness.test.ts). */
export const WEBHOOK_EVENTS = ["billing.updated", "member.invited", "test.ping"] as const;
