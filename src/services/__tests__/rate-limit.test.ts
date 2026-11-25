import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db";
import {
  consumeGlobalOtpDailyCap,
  consumeRateLimit,
  isGlobalOtpDailyCapReached,
} from "@/services/rate-limit";

describe("DB-backed rate-limit service", () => {
  it("allows requests within threshold and rejects once count exceeds max with retryAfterSec", async () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const resetAt = new Date("2026-11-25T12:10:00Z");

    const dbOk = {
      execute: vi.fn().mockResolvedValue({ rows: [{ count: 5, reset_at: resetAt.toISOString() }] }),
    } as unknown as Database;
    const allowed = await consumeRateLimit(dbOk, {
      key: "otp:req:ip:abc",
      max: 5,
      windowSec: 600,
      now,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.count).toBe(5);
    expect(allowed.retryAfterSec).toBe(600);

    const dbBlocked = {
      execute: vi.fn().mockResolvedValue({ rows: [{ count: 6, reset_at: resetAt.toISOString() }] }),
    } as unknown as Database;
    const blocked = await consumeRateLimit(dbBlocked, {
      key: "otp:req:ip:abc",
      max: 5,
      windowSec: 600,
      now,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(600);
  });

  it("checks and consumes global OTP daily cap accurately", async () => {
    const now = new Date("2026-11-25T12:00:00Z");

    const dbEmpty = { execute: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Database;
    await expect(isGlobalOtpDailyCapReached(dbEmpty, 400, now)).resolves.toBe(false);

    const dbFull = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ count: 400, reset_at: "2026-11-26T00:00:00Z" }],
      }),
    } as unknown as Database;
    await expect(isGlobalOtpDailyCapReached(dbFull, 400, now)).resolves.toBe(true);

    const dbCapAllowed = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ count: 400, reset_at: "2026-11-26T00:00:00Z" }],
      }),
    } as unknown as Database;
    await expect(consumeGlobalOtpDailyCap(dbCapAllowed, 400, now)).resolves.toBe(true);

    const dbCapExceeded = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ count: 401, reset_at: "2026-11-26T00:00:00Z" }],
      }),
    } as unknown as Database;
    await expect(consumeGlobalOtpDailyCap(dbCapExceeded, 400, now)).resolves.toBe(false);
  });
});
