import { sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  buildGlobalOtpDailyCapKey,
  calculateRetryAfterSeconds,
  getSecondsUntilNextUtcMidnight,
} from "@/domain/rate-limit";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
  resetAt: Date;
}

export async function consumeRateLimit(
  db: Database,
  params: {
    key: string;
    max: number;
    windowSec: number;
    now?: Date;
  },
): Promise<RateLimitResult> {
  const now = params.now ?? new Date();
  const nextResetAt = new Date(now.getTime() + params.windowSec * 1000);

  const result = await db.execute<{ count: number; reset_at: string | Date }>(sql`
    INSERT INTO rate_limits (key, count, reset_at, updated_at)
    VALUES (${params.key}, 1, ${nextResetAt.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.reset_at <= ${now.toISOString()}::timestamptz THEN 1
        ELSE rate_limits.count + 1
      END,
      reset_at = CASE
        WHEN rate_limits.reset_at <= ${now.toISOString()}::timestamptz THEN ${nextResetAt.toISOString()}::timestamptz
        ELSE rate_limits.reset_at
      END,
      updated_at = ${now.toISOString()}::timestamptz
    RETURNING count, reset_at
  `);

  const row = result.rows[0];
  const count = Number(row?.count ?? 1);
  const resetAt = row?.reset_at ? new Date(row.reset_at) : nextResetAt;
  const retryAfterSec = calculateRetryAfterSeconds(resetAt, now);

  return {
    allowed: count <= params.max,
    count,
    retryAfterSec,
    resetAt,
  };
}

export async function isGlobalOtpDailyCapReached(
  db: Database,
  dailyCap: number,
  now: Date = new Date(),
): Promise<boolean> {
  const key = buildGlobalOtpDailyCapKey(now);
  const result = await db.execute<{ count: number; reset_at: string | Date }>(sql`
    SELECT count, reset_at
    FROM rate_limits
    WHERE key = ${key}
      AND reset_at > ${now.toISOString()}::timestamptz
    LIMIT 1
  `);

  const row = result.rows[0];
  if (!row) {
    return false;
  }
  return Number(row.count) >= dailyCap;
}

export async function consumeGlobalOtpDailyCap(
  db: Database,
  dailyCap: number,
  now: Date = new Date(),
): Promise<boolean> {
  const key = buildGlobalOtpDailyCapKey(now);
  const secondsUntilReset = getSecondsUntilNextUtcMidnight(now);
  const outcome = await consumeRateLimit(db, {
    key,
    max: dailyCap,
    windowSec: secondsUntilReset,
    now,
  });
  return outcome.allowed;
}
