import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { getDb } from "@/db";
import { normalizeEmailAddress } from "@/domain/otp";
import { getServerEnv } from "@/lib/env";
import { releasePendingInviteCompensation } from "@/lib/invite-compensation";
import {
  extractClientIp,
  INVITE_COOKIE_NAME,
  isSameOriginRequest,
  readCookieFromHeader,
} from "@/lib/request-security";
import { createEmailTransport } from "@/services/email";
import { requestOtpForEmail, verifyOtpChallenge } from "@/services/otp";

const requestOtpBodySchema = z.object({
  email: z.string().trim().pipe(z.email()),
});

const verifyOtpBodySchema = z.object({
  email: z.string().trim().pipe(z.email()),
  code: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export function inviteOtpPlugin(): BetterAuthPlugin {
  return {
    id: "invite-otp",
    endpoints: {
      requestEmailOtp: createAuthEndpoint(
        "/otp/request",
        {
          method: "POST",
          body: requestOtpBodySchema,
        },
        async (ctx) => {
          const env = getServerEnv();
          if (ctx.request && !isSameOriginRequest(ctx.request, env.BETTER_AUTH_URL)) {
            throw new APIError("FORBIDDEN", {
              code: "CSRF_FORBIDDEN",
              message: "Invalid request origin.",
            });
          }

          const reqHeaders = ctx.headers ?? ctx.request?.headers ?? new Headers();
          const clientIp = extractClientIp(reqHeaders);
          const inviteCookieValue = readCookieFromHeader(
            reqHeaders.get("cookie"),
            INVITE_COOKIE_NAME,
          );

          const outcome = await requestOtpForEmail(
            {
              db: getDb(),
              env,
              emailTransport: createEmailTransport(env),
            },
            {
              email: ctx.body.email,
              clientIp,
              inviteCookieValue,
            },
          );

          ctx.setHeader("Cache-Control", "no-store, private");

          if (outcome.status === 429) {
            ctx.setHeader("X-Retry-After", String(outcome.retryAfterSec));
            ctx.setHeader("Retry-After", String(outcome.retryAfterSec));
            return ctx.json(outcome.body, { status: 429 });
          }

          if (outcome.status === 503) {
            return ctx.json(outcome.body, { status: 503 });
          }

          return ctx.json(outcome.body, { status: 200 });
        },
      ),

      verifyEmailOtp: createAuthEndpoint(
        "/otp/verify",
        {
          method: "POST",
          body: verifyOtpBodySchema,
        },
        async (ctx) => {
          const env = getServerEnv();

          if (ctx.request && !isSameOriginRequest(ctx.request, env.BETTER_AUTH_URL)) {
            throw new APIError("FORBIDDEN", {
              code: "CSRF_FORBIDDEN",
              message: "Invalid request origin.",
            });
          }

          const reqHeaders = ctx.headers ?? ctx.request?.headers ?? new Headers();
          const clientIp = extractClientIp(reqHeaders);

          const verificationOutcome = await verifyOtpChallenge(
            { db: getDb(), env },
            {
              email: ctx.body.email,
              code: ctx.body.code,
              clientIp,
            },
          );

          ctx.setHeader("Cache-Control", "no-store, private");

          if (verificationOutcome.status === 429) {
            ctx.setHeader("X-Retry-After", String(verificationOutcome.retryAfterSec));
            ctx.setHeader("Retry-After", String(verificationOutcome.retryAfterSec));
            return ctx.json(verificationOutcome.body, { status: 429 });
          }

          if (verificationOutcome.status !== 200) {
            return ctx.json(verificationOutcome.body, { status: verificationOutcome.status });
          }

          const email = normalizeEmailAddress(verificationOutcome.email);
          const existing = await ctx.context.internalAdapter.findUserByEmail(email);

          let authenticatedUser;

          if (existing) {
            authenticatedUser = existing.user;
            if (!authenticatedUser.emailVerified) {
              const updated = await ctx.context.internalAdapter.updateUser(
                authenticatedUser.id,
                { emailVerified: true },
              );
              if (updated) {
                authenticatedUser = updated;
              }
            }
          } else {
            const fallbackName = email.split("@")[0]?.slice(0, 50) || "Member";
            const compensationToken = ctx.request ?? ctx;
            try {
              // Triggers databaseHooks.user.create.before (atomic invite consumption)
              // and databaseHooks.user.create.after (clears maewsave_invite cookie once)
              authenticatedUser = await ctx.context.internalAdapter.createUser(
                {
                  email,
                  emailVerified: true,
                  name: fallbackName,
                },
                { method: "email-otp" },
              );
            } catch (error) {
              // Ensure non-APIError DB failures (e.g. unique email race) release the consumed invite slot
              await releasePendingInviteCompensation(getDb(), compensationToken);
              throw error;
            }
          }

          const createdSession = await ctx.context.internalAdapter.createSession(
            authenticatedUser.id,
          );

          await setSessionCookie(ctx, {
            session: createdSession,
            user: authenticatedUser,
          });

          return ctx.json({
            ok: true,
            user: {
              id: authenticatedUser.id,
              email: authenticatedUser.email,
              name: authenticatedUser.name,
            },
          });
        },
      ),
    },
  };
}
