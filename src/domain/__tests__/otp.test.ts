import { describe, expect, it } from "vitest";
import {
  evaluateOtpChallengeState,
  generateOtpCode,
  hashOtpCode,
  isValidOtpFormat,
  normalizeEmailAddress,
  verifyOtpHash,
} from "@/domain/otp";

const TEST_HMAC_KEY = "0123456789".repeat(4);

describe("otp domain logic", () => {
  it("generates 6-digit zero-padded numeric OTP codes", () => {
    for (let i = 0; i < 20; i += 1) {
      const code = generateOtpCode();
      expect(isValidOtpFormat(code)).toBe(true);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("validates OTP format strictly", () => {
    expect(isValidOtpFormat("042819")).toBe(true);
    expect(isValidOtpFormat(" 042819 ")).toBe(true);
    expect(isValidOtpFormat("")).toBe(false);
    expect(isValidOtpFormat("   ")).toBe(false);
    expect(isValidOtpFormat("12345")).toBe(false);
    expect(isValidOtpFormat("1234567")).toBe(false);
    expect(isValidOtpFormat("12a456")).toBe(false);
  });

  it("hashes and verifies OTP bound to normalized email and secret in constant time", () => {
    expect(normalizeEmailAddress("  User@Example.COM ")).toBe("user@example.com");

    const hashed = hashOtpCode("User@Example.com", "482910", TEST_HMAC_KEY);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain("482910");

    expect(verifyOtpHash("user@example.com", "482910", hashed, TEST_HMAC_KEY)).toBe(true);
    expect(verifyOtpHash("USER@EXAMPLE.COM", "482910", hashed, TEST_HMAC_KEY)).toBe(true);
    expect(verifyOtpHash("user@example.com", "482911", hashed, TEST_HMAC_KEY)).toBe(false);
    expect(verifyOtpHash("other@example.com", "482910", hashed, TEST_HMAC_KEY)).toBe(false);
    expect(verifyOtpHash("user@example.com", "482910", hashed, "abcdefghij".repeat(4))).toBe(false);
    expect(verifyOtpHash("user@example.com", "482910", "short", TEST_HMAC_KEY)).toBe(false);
    expect(verifyOtpHash("user@example.com", "not6dg", hashed, TEST_HMAC_KEY)).toBe(false);
  });

  it("evaluates challenge states accurately (consumed, locked, expired, valid)", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const future = new Date("2026-11-25T12:10:00Z");
    const past = new Date("2026-11-25T11:59:59Z");

    expect(
      evaluateOtpChallengeState(
        { expiresAt: future, consumedAt: null, attempts: 0, maxAttempts: 5 },
        now,
      ),
    ).toBe("valid");
    expect(
      evaluateOtpChallengeState(
        { expiresAt: future, consumedAt: now, attempts: 0, maxAttempts: 5 },
        now,
      ),
    ).toBe("consumed");
    expect(
      evaluateOtpChallengeState(
        { expiresAt: future, consumedAt: null, attempts: 5, maxAttempts: 5 },
        now,
      ),
    ).toBe("locked");
    expect(
      evaluateOtpChallengeState(
        { expiresAt: past, consumedAt: null, attempts: 2, maxAttempts: 5 },
        now,
      ),
    ).toBe("expired");
    expect(
      evaluateOtpChallengeState(
        { expiresAt: now, consumedAt: null, attempts: 0, maxAttempts: 5 },
        now,
      ),
    ).toBe("expired");
    expect(
      evaluateOtpChallengeState(
        { expiresAt: past, consumedAt: now, attempts: 5, maxAttempts: 5 },
        now,
      ),
    ).toBe("consumed");
    expect(
      evaluateOtpChallengeState(
        { expiresAt: past, consumedAt: null, attempts: 5, maxAttempts: 5 },
        now,
      ),
    ).toBe("locked");
  });
});
