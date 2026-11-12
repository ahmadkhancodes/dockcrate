/** One line per role, used under the invite form, in the invitation e-mail and checked against the docs (tests/unit/usefulness.test.ts). */
export const ROLE_TEXT: Record<"owner" | "admin" | "operator" | "viewer", string> = {
  owner: "Everything, including billing.",
  admin: "Connects tenants, sets up rings, publishes and rolls back, invites members, manages API keys and webhooks. Cannot change the plan.",
  operator: "Publishes, rolls back and turns auto update on or off in the tenants they are given. Cannot connect tenants, change rings, invite people or manage keys.",
  viewer: "Reads apps, tenants and rings. Changes nothing.",
};

export const roleText = (role: string) => ROLE_TEXT[role as keyof typeof ROLE_TEXT] ?? "";
