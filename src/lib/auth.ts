import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { normalizeEmailAddress } from "@/domain/otp";
import { buildRateLimitKey } from "@/domain/rate-limit";
import { inviteOtpPlugin } from "@/lib/auth-plugins/otp-plugin";
import { getServerEnv } from "@/lib/env";
import {
  clearPendingInviteCompensation,
  releasePendingInviteCompensation,
  trackPendingInviteCompensation,
} from "@/lib/invite-compensation";
import {
  extractClientIp,
  INVITE_COOKIE_NAME,
  readCookieFromHeader,
} from "@/lib/request-security";
import { consumeInviteCodeAtomically } from "@/services/invitations";
import { consumeRateLimit } from "@/services/rate-limit";

const OAUTH_SIGNIN_IP_LIMIT = {
  scope: "oauth:signin:ip",
  max: 20,
  windowSec: 600,
} as const;

const DISABLED_AUTH_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/change-password",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/unlink-account",
  "/link-social",
  "/get-access-token",
  "/refresh-token",
  "/account-info",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/verify-email",
  "/update-user",
  "/update-session",
  "/verify-password",
];

function createAuthInstance() {
  const env = getServerEnv();
  const db = getDb();
  const isProd = env.NODE_ENV === "production";
  const sessionExpiresInSeconds = env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
  const ipAddressHeaders =
    process.env.VERCEL === "1"
      ? ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]
      : ["x-real-ip", "x-forwarded-for"];

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    disabledPaths: DISABLED_AUTH_PATHS,
    onAPIError: {
      errorURL: "/sign-in",
    },
    // Disable Better Auth's in-memory Map limiter; enforce DB-backed serverless rate limits instead
    rateLimit: {
      enabled: false,
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: ["openid", "email", "profile"],
        disableDefaultScope: true,
        prompt: "select_account",
        accessType: "online",
        includeGrantedScopes: false,
      },
    },
    user: {
      // Defense-in-depth: block unverified OAuth/provider identities on create-user and link-account
      validateUserInfo: async ({ user: incoming, source }) => {
        if (
          (source.action === "create-user" || source.action === "link-account") &&
          incoming.emailVerified !== true
        ) {
          return { error: "A verified email address is required." };
        }
      },
    },
    account: {
      // Do NOT put "google" in trustedProviders so email_verified === true is always required before linking
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: true,
      },
    },
    session: {
      expiresIn: sessionExpiresInSeconds,
      updateAge: 24 * 60 * 60,
      cookieCache: {
        enabled: false,
      },
    },
    advanced: {
      useSecureCookies: isProd,
      ipAddress: {
        ipAddressHeaders,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/social") {
          return;
        }

        // Enforce DB-backed serverless rate limit on Google OAuth sign-in initiation
        const reqHeaders = ctx.headers ?? ctx.request?.headers ?? new Headers();
        const clientIp = extractClientIp(reqHeaders);
        const limit = await consumeRateLimit(db, {
          key: buildRateLimitKey(OAUTH_SIGNIN_IP_LIMIT.scope, clientIp),
          max: OAUTH_SIGNIN_IP_LIMIT.max,
          windowSec: OAUTH_SIGNIN_IP_LIMIT.windowSec,
        });
        if (!limit.allowed) {
          // Pass headers via 3rd APIError argument so better-call toResponse() emits them on 429
          throw new APIError(
            "TOO_MANY_REQUESTS",
            {
              code: "RATE_LIMITED",
              message: "Too many sign-in attempts.",
              retryAfterSec: limit.retryAfterSec,
            },
            {
              "X-Retry-After": String(limit.retryAfterSec),
              "Retry-After": String(limit.retryAfterSec),
              "Cache-Control": "no-store, private",
            },
          );
        }

        // Strip caller-supplied OAuth overrides so openid/email/profile + prompt=select_account cannot be bypassed
        if (ctx.body && typeof ctx.body === "object") {
          const mutableBody = ctx.body as Record<string, unknown>;
          delete mutableBody.scopes;
          delete mutableBody.additionalParams;
          delete mutableBody.idToken;
          delete mutableBody.additionalData;
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const tokenObj = ctx.request ?? ctx;
        if (ctx.context.returned instanceof Error) {
          await releasePendingInviteCompensation(db, tokenObj);
        } else {
          clearPendingInviteCompensation(tokenObj);
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (userRecord, ctx) => {
            if (userRecord.emailVerified !== true) {
              throw new APIError("FORBIDDEN", {
                code: "EMAIL_NOT_VERIFIED",
                message: "A verified email address is required to create an account.",
              });
            }

            const cookieHeader = ctx?.headers?.get("cookie") ?? ctx?.request?.headers.get("cookie");
            const rawInviteCode = readCookieFromHeader(cookieHeader, INVITE_COOKIE_NAME);
            const consumed = await consumeInviteCodeAtomically(db, rawInviteCode);

            if (!consumed) {
              throw new APIError("FORBIDDEN", {
                code: "INVITE_REQUIRED",
                message: "A valid invitation code is required to sign up.",
              });
            }

            if (ctx) {
              const tokenObj = ctx.request ?? ctx;
              trackPendingInviteCompensation(tokenObj, consumed.id);
            }

            return {
              data: {
                ...userRecord,
                email: normalizeEmailAddress(userRecord.email),
              },
            };
          },
          after: async (_userRecord, ctx) => {
            if (ctx) {
              const tokenObj = ctx.request ?? ctx;
              clearPendingInviteCompensation(tokenObj);
              ctx.setCookie(INVITE_COOKIE_NAME, "", {
                path: "/",
                httpOnly: true,
                secure: isProd,
                sameSite: "lax",
                maxAge: 0,
              });
            }
          },
        },
        update: {
          before: async (updateData) => {
            if (updateData.emailVerified === false) {
              throw new APIError("FORBIDDEN", {
                code: "FORBIDDEN",
                message: "Email verification status cannot be revoked.",
              });
            }
            if (typeof updateData.email === "string") {
              return {
                data: {
                  ...updateData,
                  email: normalizeEmailAddress(updateData.email),
                },
              };
            }
            return { data: updateData };
          },
        },
      },
      account: {
        create: {
          before: async (accountRecord) => ({
            data: {
              ...accountRecord,
              // Never persist Google access/refresh/ID tokens in PostgreSQL
              accessToken: null,
              refreshToken: null,
              idToken: null,
              accessTokenExpiresAt: null,
              refreshTokenExpiresAt: null,
            },
          }),
        },
        update: {
          before: async (accountUpdate) => ({
            data: {
              ...accountUpdate,
              accessToken: null,
              refreshToken: null,
              idToken: null,
              accessTokenExpiresAt: null,
              refreshTokenExpiresAt: null,
            },
          }),
        },
      },
    },
    plugins: [inviteOtpPlugin(), nextCookies()],
  });
}

export type AuthInstance = ReturnType<typeof createAuthInstance>;

let cachedAuth: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  if (cachedAuth === null) {
    cachedAuth = createAuthInstance();
  }
  return cachedAuth;
}
