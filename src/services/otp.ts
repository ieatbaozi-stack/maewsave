import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { otpChallenges, rateLimits, session, user, verification } from "@/db/auth-schema";
import {
  generateOtpCode,
  hashOtpCode,
  isValidOtpFormat,
  normalizeEmailAddress,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  OTP_TTL_SECONDS,
  verifyOtpHash,
} from "@/domain/otp";
import { buildRateLimitKey, RATE_LIMIT_RULES } from "@/domain/rate-limit";
import type { ServerEnv } from "@/lib/env";
import { renderOtpEmail, type EmailTransport } from "@/services/email";
import { isInviteCodeCurrentlyValid } from "@/services/invitations";
import {
  consumeGlobalOtpDailyCap,
  consumeRateLimit,
  isGlobalOtpDailyCapReached,
} from "@/services/rate-limit";

export type OtpRequestOutcome =
  | {
      status: 200;
      body: { ok: true; retryAfterSec: number };
      emailSent: boolean;
    }
  | {
      status: 429;
      retryAfterSec: number;
      body: { error: "RATE_LIMITED"; retryAfterSec: number };
    }
  | {
      status: 503;
      body: { error: "OTP_DAILY_CAP_REACHED" | "OTP_DELIVERY_UNAVAILABLE" };
    };

export type OtpVerifyOutcome =
  | { status: 200; email: string }
  // Always return a uniform INVALID_OTP error to preserve anti-enumeration
  | { status: 400; body: { error: "INVALID_OTP" } }
  | {
      status: 429;
      retryAfterSec: number;
      body: { error: "RATE_LIMITED"; retryAfterSec: number };
    };

export interface OtpServiceDeps {
  db: Database;
  env: Pick<ServerEnv, "BETTER_AUTH_SECRET" | "OTP_DAILY_CAP">;
  emailTransport: EmailTransport;
}

export async function requestOtpForEmail(
  deps: OtpServiceDeps,
  params: {
    email: string;
    clientIp: string;
    inviteCookieValue: string | null;
    now?: Date;
  },
): Promise<OtpRequestOutcome> {
  const now = params.now ?? new Date();
  const email = normalizeEmailAddress(params.email);

  // 1. IP rate limit: <= 5 requests / 10 min
  const ipLimit = await consumeRateLimit(deps.db, {
    key: buildRateLimitKey(RATE_LIMIT_RULES.OTP_REQUEST_IP.scope, params.clientIp),
    max: RATE_LIMIT_RULES.OTP_REQUEST_IP.max,
    windowSec: RATE_LIMIT_RULES.OTP_REQUEST_IP.windowSec,
    now,
  });
  if (!ipLimit.allowed) {
    return {
      status: 429,
      retryAfterSec: ipLimit.retryAfterSec,
      body: { error: "RATE_LIMITED", retryAfterSec: ipLimit.retryAfterSec },
    };
  }

  // 2. Per-email cooldown: >= 60s between sends
  const cooldownLimit = await consumeRateLimit(deps.db, {
    key: buildRateLimitKey(RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_COOLDOWN.scope, email),
    max: RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_COOLDOWN.max,
    windowSec: RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_COOLDOWN.windowSec,
    now,
  });
  if (!cooldownLimit.allowed) {
    return {
      status: 429,
      retryAfterSec: cooldownLimit.retryAfterSec,
      body: { error: "RATE_LIMITED", retryAfterSec: cooldownLimit.retryAfterSec },
    };
  }

  // 3. Per-email hourly: <= 5 / hour
  const hourlyLimit = await consumeRateLimit(deps.db, {
    key: buildRateLimitKey(RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_HOURLY.scope, email),
    max: RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_HOURLY.max,
    windowSec: RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_HOURLY.windowSec,
    now,
  });
  if (!hourlyLimit.allowed) {
    return {
      status: 429,
      retryAfterSec: hourlyLimit.retryAfterSec,
      body: { error: "RATE_LIMITED", retryAfterSec: hourlyLimit.retryAfterSec },
    };
  }

  // 4. Per-email daily: <= 10 / day
  const dailyLimit = await consumeRateLimit(deps.db, {
    key: buildRateLimitKey(RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_DAILY.scope, email),
    max: RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_DAILY.max,
    windowSec: RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_DAILY.windowSec,
    now,
  });
  if (!dailyLimit.allowed) {
    return {
      status: 429,
      retryAfterSec: dailyLimit.retryAfterSec,
      body: { error: "RATE_LIMITED", retryAfterSec: dailyLimit.retryAfterSec },
    };
  }

  // 5. Global daily cap check (read-only peek first so uninvited emails never burn quota)
  const capAlreadyReached = await isGlobalOtpDailyCapReached(
    deps.db,
    deps.env.OTP_DAILY_CAP,
    now,
  );
  if (capAlreadyReached) {
    return {
      status: 503,
      body: { error: "OTP_DAILY_CAP_REACHED" },
    };
  }

  // 6. CRITICAL PRE-GATE: must be an existing user OR hold a currently valid invite cookie.
  // If neither holds, DO NOT create OTP, DO NOT burn Gmail quota, and return 200 (anti-enumeration).
  const existingUsers = await deps.db
    .select({ id: user.id })
    .from(user)
    .where(sql`LOWER(${user.email}) = ${email}`)
    .limit(1);

  const hasExistingAccount = existingUsers.length > 0;
  const hasValidInvite = hasExistingAccount
    ? false
    : await isInviteCodeCurrentlyValid(deps.db, params.inviteCookieValue, now);

  if (!hasExistingAccount && !hasValidInvite) {
    return {
      status: 200,
      body: { ok: true, retryAfterSec: RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_COOLDOWN.windowSec },
      emailSent: false,
    };
  }

  // 7. Atomically reserve 1 slot in the global daily cap
  const reserved = await consumeGlobalOtpDailyCap(deps.db, deps.env.OTP_DAILY_CAP, now);
  if (!reserved) {
    return {
      status: 503,
      body: { error: "OTP_DAILY_CAP_REACHED" },
    };
  }

  // 8. Invalidate prior unconsumed OTPs for this email, then insert newly hashed 6-digit OTP
  const otp = generateOtpCode();
  const codeHash = hashOtpCode(email, otp, deps.env.BETTER_AUTH_SECRET);
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

  await deps.db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.email, email), isNull(otpChallenges.consumedAt)));

  const inserted = await deps.db
    .insert(otpChallenges)
    .values({
      email,
      codeHash,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      expiresAt,
    })
    .returning({ id: otpChallenges.id });

  const createdChallengeId = inserted[0]?.id;

  // 9. Send via decoupled Email Transport Layer (never leak raw email/OTP on transport failure)
  const rendered = renderOtpEmail({ otp, expiresInMinutes: OTP_TTL_MINUTES });
  try {
    await deps.emailTransport.send({
      to: email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  } catch {
    if (createdChallengeId) {
      await deps.db
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(eq(otpChallenges.id, createdChallengeId));
    }
    return {
      status: 503,
      body: { error: "OTP_DELIVERY_UNAVAILABLE" },
    };
  }

  return {
    status: 200,
    body: { ok: true, retryAfterSec: RATE_LIMIT_RULES.OTP_REQUEST_EMAIL_COOLDOWN.windowSec },
    emailSent: true,
  };
}

export async function verifyOtpChallenge(
  deps: {
    db: Database;
    env: Pick<ServerEnv, "BETTER_AUTH_SECRET">;
  },
  params: {
    email: string;
    code: string;
    clientIp: string;
    now?: Date;
  },
): Promise<OtpVerifyOutcome> {
  const now = params.now ?? new Date();
  const email = normalizeEmailAddress(params.email);

  // 1. IP verify rate limit: <= 10 / 10 min
  const ipLimit = await consumeRateLimit(deps.db, {
    key: buildRateLimitKey(RATE_LIMIT_RULES.OTP_VERIFY_IP.scope, params.clientIp),
    max: RATE_LIMIT_RULES.OTP_VERIFY_IP.max,
    windowSec: RATE_LIMIT_RULES.OTP_VERIFY_IP.windowSec,
    now,
  });
  if (!ipLimit.allowed) {
    return {
      status: 429,
      retryAfterSec: ipLimit.retryAfterSec,
      body: { error: "RATE_LIMITED", retryAfterSec: ipLimit.retryAfterSec },
    };
  }

  if (!isValidOtpFormat(params.code)) {
    return { status: 400, body: { error: "INVALID_OTP" } };
  }

  // 2. Locate latest unconsumed challenge id for this email
  const rows = await deps.db
    .select({ id: otpChallenges.id })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.email, email), isNull(otpChallenges.consumedAt)))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  const latest = rows[0];
  if (!latest) {
    return { status: 400, body: { error: "INVALID_OTP" } };
  }

  // 3. Atomically claim 1 attempt slot BEFORE checking HMAC (eliminates concurrent brute-force TOCTOU)
  const claimedRows = await deps.db
    .update(otpChallenges)
    .set({
      attempts: sql`${otpChallenges.attempts} + 1`,
    })
    .where(
      and(
        eq(otpChallenges.id, latest.id),
        isNull(otpChallenges.consumedAt),
        lt(otpChallenges.attempts, otpChallenges.maxAttempts),
        gt(otpChallenges.expiresAt, now),
      ),
    )
    .returning({
      id: otpChallenges.id,
      codeHash: otpChallenges.codeHash,
      attempts: otpChallenges.attempts,
      maxAttempts: otpChallenges.maxAttempts,
    });

  const claimed = claimedRows[0];
  if (!claimed) {
    return { status: 400, body: { error: "INVALID_OTP" } };
  }

  // 4. Constant-time HMAC hash verification
  const isMatch = verifyOtpHash(
    email,
    params.code,
    claimed.codeHash,
    deps.env.BETTER_AUTH_SECRET,
  );

  if (!isMatch) {
    if (claimed.attempts >= claimed.maxAttempts) {
      await deps.db
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(and(eq(otpChallenges.id, claimed.id), isNull(otpChallenges.consumedAt)));
    }
    return { status: 400, body: { error: "INVALID_OTP" } };
  }

  // 5. Atomically mark consumed to prevent concurrent replay of the exact same OTP
  const consumed = await deps.db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, claimed.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });

  if (consumed.length === 0) {
    return { status: 400, body: { error: "INVALID_OTP" } };
  }

  return { status: 200, email };
}

export async function cleanupExpiredAuthRecords(
  db: Database,
  now: Date = new Date(),
): Promise<{
  otpChallengesDeleted: number;
  rateLimitsDeleted: number;
  sessionsDeleted: number;
  verificationsDeleted: number;
}> {
  const otpCutoff = new Date(now.getTime() - 60 * 60 * 1000);

  const [deletedOtps, deletedRateLimits, deletedSessions, deletedVerifications] =
    await Promise.all([
      db
        .delete(otpChallenges)
        .where(or(lt(otpChallenges.expiresAt, otpCutoff), lt(otpChallenges.consumedAt, otpCutoff)))
        .returning({ id: otpChallenges.id }),
      db
        .delete(rateLimits)
        .where(lt(rateLimits.resetAt, now))
        .returning({ key: rateLimits.key }),
      db
        .delete(session)
        .where(lt(session.expiresAt, now))
        .returning({ id: session.id }),
      db
        .delete(verification)
        .where(lt(verification.expiresAt, now))
        .returning({ id: verification.id }),
    ]);

  return {
    otpChallengesDeleted: deletedOtps.length,
    rateLimitsDeleted: deletedRateLimits.length,
    sessionsDeleted: deletedSessions.length,
    verificationsDeleted: deletedVerifications.length,
  };
}
