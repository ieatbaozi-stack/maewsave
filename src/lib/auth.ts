import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { isAllowedEmail } from "@/lib/email-whitelist";
import { getServerEnv } from "@/lib/env";

function createAuthInstance() {
  const env = getServerEnv();
  const db = getDb();
  const isProd = env.NODE_ENV === "production";

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    onAPIError: {
      errorURL: "/sign-in",
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    account: {
      encryptOAuthTokens: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "jwe",
      },
    },
    advanced: {
      useSecureCookies: isProd,
      // Default to Lax so cross-site Google OAuth callback can return the temporary state cookie.
      defaultCookieAttributes: {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
      },
      // Enforce Strict on the actual session cookies; /auth/complete resets initiator to same-origin.
      cookies: {
        session_token: {
          attributes: {
            httpOnly: true,
            secure: isProd,
            sameSite: "strict",
          },
        },
        session_data: {
          attributes: {
            httpOnly: true,
            secure: isProd,
            sameSite: "strict",
          },
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (userRecord) => {
            if (
              userRecord.emailVerified !== true ||
              !isAllowedEmail(userRecord.email, env.ALLOWED_USER_EMAIL)
            ) {
              throw new APIError("FORBIDDEN", {
                code: "FORBIDDEN",
                message: "Access is restricted to the verified authorized owner account.",
              });
            }
            return { data: userRecord };
          },
        },
        update: {
          before: async (updateData) => {
            if (
              typeof updateData.email === "string" &&
              !isAllowedEmail(updateData.email, env.ALLOWED_USER_EMAIL)
            ) {
              throw new APIError("FORBIDDEN", {
                code: "FORBIDDEN",
                message: "Owner email cannot be changed to a non-whitelisted address.",
              });
            }
            if (updateData.emailVerified === false) {
              throw new APIError("FORBIDDEN", {
                code: "FORBIDDEN",
                message: "Owner email verification status cannot be revoked.",
              });
            }
            return { data: updateData };
          },
        },
      },
      session: {
        create: {
          before: async (sessionRecord) => {
            const matchedUsers = await db
              .select({
                email: schema.user.email,
                emailVerified: schema.user.emailVerified,
              })
              .from(schema.user)
              .where(eq(schema.user.id, sessionRecord.userId))
              .limit(1);

            const owner = matchedUsers[0];
            if (
              !owner ||
              owner.emailVerified !== true ||
              !isAllowedEmail(owner.email, env.ALLOWED_USER_EMAIL)
            ) {
              throw new APIError("FORBIDDEN", {
                code: "FORBIDDEN",
                message: "Session denied for non-whitelisted or unverified account.",
              });
            }
            return { data: sessionRecord };
          },
        },
      },
    },
    plugins: [nextCookies()],
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
