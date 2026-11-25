import { createHash } from "node:crypto";

export interface RateLimitRule {
  readonly scope: string;
  readonly max: number;
  readonly windowSec: number;
}

export const RATE_LIMIT_RULES = {
  INVITE_CHECK_IP: { scope: "invite:check:ip", max: 10, windowSec: 600 },
  OTP_REQUEST_IP: { scope: "otp:req:ip", max: 5, windowSec: 600 },
  OTP_VERIFY_IP: { scope: "otp:ver:ip", max: 10, windowSec: 600 },
  OTP_REQUEST_EMAIL_COOLDOWN: { scope: "otp:cd:email", max: 1, windowSec: 60 },
  OTP_REQUEST_EMAIL_HOURLY: { scope: "otp:hr:email", max: 5, windowSec: 3600 },
  OTP_REQUEST_EMAIL_DAILY: { scope: "otp:day:email", max: 10, windowSec: 86400 },
  ADMIN_CREATE_INVITE_DAILY: { scope: "admin:inv:day", max: 20, windowSec: 86400 },
} as const satisfies Record<string, RateLimitRule>;

export function hashRateLimitSubject(subject: string): string {
  return createHash("sha256")
    .update(subject.trim().toLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 32);
}

export function buildRateLimitKey(scope: string, subject: string): string {
  return `${scope}:${hashRateLimitSubject(subject)}`;
}

export function getUtcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function buildGlobalOtpDailyCapKey(now: Date = new Date()): string {
  return `otp:global:day:${getUtcDateKey(now)}`;
}

export function getSecondsUntilNextUtcMidnight(now: Date = new Date()): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
  );
  return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
}

export function calculateRetryAfterSeconds(resetAt: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}
