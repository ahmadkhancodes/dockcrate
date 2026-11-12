import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink, organization, twoFactor } from "better-auth/plugins";
import { memoryAdapter } from "better-auth/adapters/memory";
import { passkey } from "@better-auth/passkey";
import { apiKey } from "@better-auth/api-key";
import { product } from "@/config/product";
import { appName, appUrl, dbDriver, entraConfigured, env, isProd } from "@/lib/env";
import { envCredentialSigner } from "@/lib/graph/credential";
import { ENTRA_AUTHORITY, assertWorkAccount } from "./entra";
import { ensureMemberPrefs } from "@/lib/alerts";
import { defaultDeps } from "@/lib/deps";
import { sendMail } from "@/lib/mail";
import { log } from "@/lib/logger";
import { inviteEmail, magicLinkEmail } from "@/lib/mail/templates";
import { emitEvent } from "@/lib/webhooks/outbound";
import { isDisposableEmail } from "@/lib/security/disposable";
import { rateLimit, RULES } from "@/lib/security/ratelimit";
import { getDb } from "@/lib/db";
import { ac, roles } from "./roles";

// Better Auth: magic link, passkeys, TOTP, orgs + roles, API keys (hashed, prefix shown).
// Sessions live in httpOnly `__Host-` cookies in production (see cookieConfig), SameSite=Lax, Path=/.

const COOKIE_NAMES = ["session_token", "session_data", "account_data", "dont_remember", "two_factor"] as const;

/** `__Host-` needs Secure + Path=/ + no Domain. Better Auth only auto-prefixes `__Secure-`, so we name them ourselves. */
function cookieConfig(secure: boolean): NonNullable<BetterAuthOptions["advanced"]> {
  const app = appName();
  if (!secure) return { cookiePrefix: app, useSecureCookies: false };
  return {
    useSecureCookies: false,
    cookiePrefix: app,
    defaultCookieAttributes: { secure: true, httpOnly: true, sameSite: "lax", path: "/" },
    cookies: Object.fromEntries(
      COOKIE_NAMES.map((n) => [n, { name: `__Host-${app}.${n}`, attributes: { secure: true, path: "/" } }]),
    ),
  };
}

declare global {
  var __kitAuthMemory: Record<string, unknown[]> | undefined;
  var __kitAuth: ReturnType<typeof createAuth> | undefined;
}

async function database(): Promise<BetterAuthOptions["database"]> {
  const e = env();
  if (dbDriver(e) === "memory") {
    globalThis.__kitAuthMemory ??= {
      user: [], session: [], account: [], verification: [], organization: [], member: [], invitation: [],
      twoFactor: [], passkey: [], apikey: [], rateLimit: [],
    };
    return memoryAdapter(globalThis.__kitAuthMemory as never);
  }
  const { mongodbAdapter } = await import("better-auth/adapters/mongodb");
  const { mongoClient } = await import("@/lib/db/mongo");
  const client = await mongoClient(e.MONGODB_URI!);
  return mongodbAdapter(client.db(e.MONGODB_DB ?? appName(e)), { client, transaction: false });
}

/**
 * No implicit linking by email. Entra's `email` claim is set by each tenant's admins and is not proof of the mailbox,
 * so trusting it would let a user from any tenant take over an existing account with the same address (nOAuth).
 * A user is their Microsoft account (`tid` + `oid`); a second Microsoft account with the same email is refused.
 */
export const ACCOUNT_LINKING = { enabled: false, trustedProviders: [] as string[] };

type HookMember = { organizationId: string; userId: string; role: string };
async function safeSend(msg: Parameters<typeof sendMail>[0], kind: string) {
  try { await sendMail(msg); } catch (e) { log.warn("mail_failed", { kind, message: (e as Error)?.message }); }
}

type HookUser = { email: string };

/** Alert preference rows are written when a member is added or changes role, not on first app open (REVIEW P1-12). A failure never blocks joining. */
export function memberPrefsHooks() {
  const write = async ({ member, user }: { member: HookMember; user: HookUser }) => {
    try {
      await ensureMemberPrefs(await defaultDeps(), [{ orgId: member.organizationId, userId: member.userId, email: user.email, role: member.role }]);
    } catch { /* the row is also created on first open as a fallback */ }
  };
  return { afterCreateOrganization: write, afterAddMember: write, afterAcceptInvitation: write, afterUpdateMemberRole: write };
}

/**
 * Sign-in mail brake (SECURITY-REVIEW S-3): Better Auth only limits per IP, so many IPs (or a spoofed
 * x-forwarded-for off Vercel) could mail-bomb one address. Every address gets at most RULES.authEmail links per
 * 10 minutes and every IP RULES.authIp, whether or not an account exists, so the answer reveals nothing.
 */
export const signInMailBrake = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/magic-link") return;
  const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase().slice(0, 320) : "";
  const h = ctx.request?.headers ?? ctx.headers;
  const ip = (h?.get("x-forwarded-for")?.split(",")[0]?.trim() || h?.get("x-real-ip") || "unknown").slice(0, 64);
  const db = await getDb();
  const [byEmail, byIp] = await Promise.all([
    email ? rateLimit(`signin:email:${email}`, RULES.authEmail, db) : Promise.resolve({ ok: true }),
    rateLimit(`signin:ip:${ip}`, RULES.authIp, db),
  ]);
  if (!byEmail.ok || !byIp.ok) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in emails. Wait a few minutes and try again.", code: "rate_limited" });
});

export function createAuth(db: BetterAuthOptions["database"]) {
  const e = env();
  const base = appUrl(e);
  const secure = base.startsWith("https://");
  return betterAuth({
    appName: product.name,
    baseURL: base,
    secret: e.BETTER_AUTH_SECRET ?? (isProd() ? undefined : "dev-only-secret-dev-only-secret-0000"),
    database: db,
    trustedOrigins: [base, ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []), ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : [])],
    advanced: cookieConfig(secure),
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 300 },
    },
    rateLimit: { enabled: true, window: 60, max: 60, storage: "database" },
    hooks: { before: signInMailBrake },
    emailAndPassword: { enabled: false },
    // Microsoft Entra work accounts only (D-07): `organizations` authority, personal MSA tenant rejected twice
    // (by Better Auth's issuer check and by assertWorkAccount, which gives the clear message).
    socialProviders: entraConfigured(e)
      ? {
          microsoft: {
            clientId: e.ENTRA_CLIENT_ID!,
            clientSecret: e.ENTRA_CLIENT_SECRET ?? "",
            ...(e.ENTRA_CLIENT_SECRET ? {} : { clientAssertion: ({ clientId, tokenEndpoint }: { clientId: string; tokenEndpoint: string }) => envCredentialSigner().signAssertion({ clientId, tokenEndpoint }) }),
            tenantId: ENTRA_AUTHORITY,
            scope: ["openid", "profile", "email", "User.Read"],
            mapProfileToUser: (profile: Record<string, unknown>) => {
              assertWorkAccount({ tid: profile.tid as string | undefined, iss: profile.iss as string | undefined });
              return {};
            },
          },
        }
      : undefined,
    user: {
      deleteUser: { enabled: true },
      additionalFields: { analyticsConsent: { type: "boolean", required: false, defaultValue: false, input: true } },
    },
    account: { accountLinking: ACCOUNT_LINKING },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (isDisposableEmail(user.email)) return false;
            return { data: { ...user, email: user.email.toLowerCase() } };
          },
        },
      },
    },
    plugins: [
      // Email link sign in exists only in stub mode (no Entra app configured: local dev and e2e). With Entra it is not registered.
      ...(entraConfigured(e)
        ? []
        : [
            magicLink({
              expiresIn: 600,
              disableSignUp: false,
              sendMagicLink: async ({ email, url }) => {
                const m = magicLinkEmail(url);
                await safeSend({ to: email, ...m, category: "transactional" }, "magic_link");
              },
            }),
          ]),
      twoFactor({ issuer: product.name, skipVerificationOnEnable: false }),
      passkey({ rpName: product.fullName, rpID: new URL(base).hostname, origin: base }),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        allowUserToCreateOrganization: true,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        organizationHooks: memberPrefsHooks(),
        sendInvitationEmail: async (data) => {
          const url = `${base}/accept-invite/${data.id}`;
          const m = inviteEmail({ orgName: data.organization.name, inviter: data.inviter.user.name || data.inviter.user.email, url, role: data.role });
          // The invitation row exists; if the provider rejects, the inviter can resend. Never surface provider errors.
          await safeSend({ to: data.email, ...m, category: "transactional" }, "invitation");
          // Customer webhooks subscribed to member.invited (offered in Settings, then Webhooks), e.g. to open a PSA ticket.
          await emitEvent(data.organization.id, "member.invited", { invitationId: data.id, email: data.email, role: data.role, invitedBy: data.inviter.user.email }).catch(() => []);
        },
      }),
      apiKey({
        references: "organization",
        defaultPrefix: `${product.slug.slice(0, 4)}_`,
        enableMetadata: true,
        requireName: true,
        maximumNameLength: 60, // matches the 60 character limit of the API keys form
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 600 },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let pending: Promise<Auth> | null = null;
export function getAuth(): Promise<Auth> {
  if (globalThis.__kitAuth) return Promise.resolve(globalThis.__kitAuth);
  return (pending ??= database().then((db) => (globalThis.__kitAuth = createAuth(db))));
}
