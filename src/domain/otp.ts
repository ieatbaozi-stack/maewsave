import { createHmac, hkdfSync, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 600;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

const OTP_PATTERN = /^\d{6}$/;

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidOtpFormat(code: string): boolean {
  return OTP_PATTERN.test(code.trim());
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
}

function deriveOtpHmacKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "maewsave-otp-hmac-v1", 32));
}

export function hashOtpCode(email: string, code: string, secret: string): string {
  const normalizedEmail = normalizeEmailAddress(email);
  const cleanedCode = code.trim();
  const key = deriveOtpHmacKey(secret);
  return createHmac("sha256", key)
    .update(`maewsave-otp:${normalizedEmail}:${cleanedCode}`, "utf8")
    .digest("hex");
}

export function verifyOtpHash(
  email: string,
  candidateCode: string,
  expectedHash: string,
  secret: string,
): boolean {
  if (!isValidOtpFormat(candidateCode)) {
    return false;
  }

  const computedHash = hashOtpCode(email, candidateCode, secret);
  const computedBuf = Buffer.from(computedHash, "utf8");
  const expectedBuf = Buffer.from(expectedHash, "utf8");

  if (computedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(computedBuf, expectedBuf);
}

export type OtpChallengeState = "valid" | "consumed" | "expired" | "locked";

export function evaluateOtpChallengeState(
  challenge: {
    expiresAt: Date;
    consumedAt: Date | null;
    attempts: number;
    maxAttempts: number;
  },
  now: Date = new Date(),
): OtpChallengeState {
  if (challenge.consumedAt !== null) {
    return "consumed";
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    return "locked";
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "valid";
}
