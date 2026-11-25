import { describe, expect, it } from "vitest";
import {
  buildGlobalOtpDailyCapKey,
  buildRateLimitKey,
  calculateRetryAfterSeconds,
  getSecondsUntilNextUtcMidnight,
  getUtcDateKey,
  hashRateLimitSubject,
} from "@/domain/rate-limit";

describe("rate-limit domain logic", () => {
  it("hashes IP and email subjects so raw PII never appears in DB rate-limit keys", () => {
    const keyA = buildRateLimitKey("otp:cd:email", "User@Example.com");
    const keyB = buildRateLimitKey("otp:cd:email", "  user@example.com ");

    expect(keyA).toBe(keyB);
    expect(keyA).not.toContain("user@example.com");
    expect(hashRateLimitSubject("203.0.113.10")).toHaveLength(32);
  });

  it("computes UTC date keys and seconds until next UTC midnight including exact boundaries", () => {
    const now = new Date("2026-11-25T23:59:10.000Z");
    expect(getUtcDateKey(now)).toBe("2026-11-25");
    expect(buildGlobalOtpDailyCapKey(now)).toBe("otp:global:day:2026-11-25");
    expect(getSecondsUntilNextUtcMidnight(now)).toBe(50);
    expect(getSecondsUntilNextUtcMidnight(new Date("2026-11-25T00:00:00.000Z"))).toBe(86400);
    expect(getSecondsUntilNextUtcMidnight(new Date("2026-11-25T23:59:59.999Z"))).toBe(1);
  });

  it("floors Retry-After seconds at 1 including resetAt === now", () => {
    const now = new Date("2026-11-25T12:00:00.000Z");
    expect(calculateRetryAfterSeconds(new Date("2026-11-25T12:00:45.200Z"), now)).toBe(46);
    expect(calculateRetryAfterSeconds(now, now)).toBe(1);
    expect(calculateRetryAfterSeconds(new Date("2026-11-25T11:59:00.000Z"), now)).toBe(1);
  });
});
