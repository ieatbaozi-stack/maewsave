import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db";
import { hashOtpCode } from "@/domain/otp";
import type { EmailTransport } from "@/services/email";

const mockConsumeRateLimit = vi.fn();
const mockIsGlobalCapReached = vi.fn();
const mockConsumeGlobalCap = vi.fn();
const mockIsInviteValid = vi.fn();

vi.mock("@/services/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  isGlobalOtpDailyCapReached: (...args: unknown[]) => mockIsGlobalCapReached(...args),
  consumeGlobalOtpDailyCap: (...args: unknown[]) => mockConsumeGlobalCap(...args),
}));

vi.mock("@/services/invitations", () => ({
  isInviteCodeCurrentlyValid: (...args: unknown[]) => mockIsInviteValid(...args),
}));

import {
  cleanupExpiredAuthRecords,
  requestOtpForEmail,
  verifyOtpChallenge,
} from "@/services/otp";

const TEST_KEY = "0123456789".repeat(4);

function createMockDb(options: {
  existingUsers?: Array<{ id: string }>;
  selectRows?: Array<Record<string, unknown>>;
  updateReturnSequence?: Array<Array<Record<string, unknown>>>;
  insertRows?: Array<Record<string, unknown>>;
  deleteReturnSequence?: Array<Array<Record<string, unknown>>>;
}) {
  const insertReturning = vi.fn().mockResolvedValue(options.insertRows ?? [{ id: "ch-new" }]);
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });

  let updateIdx = 0;
  const updateSeq = options.updateReturnSequence ?? [[{ id: "ch-1" }]];
  const updateReturning = vi.fn().mockImplementation(async () => {
    const next = updateSeq[Math.min(updateIdx, updateSeq.length - 1)] ?? [];
    updateIdx += 1;
    return next;
  });
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });

  const selectLimit = vi.fn().mockResolvedValue(options.selectRows ?? options.existingUsers ?? []);
  const selectOrderBy = vi.fn().mockReturnValue({ limit: selectLimit });
  const selectWhere = vi.fn().mockReturnValue({
    limit: selectLimit,
    orderBy: selectOrderBy,
  });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });

  let deleteIdx = 0;
  const deleteSeq = options.deleteReturnSequence ?? [[], [], [], []];
  const deleteReturning = vi.fn().mockImplementation(async () => {
    const next = deleteSeq[Math.min(deleteIdx, deleteSeq.length - 1)] ?? [];
    deleteIdx += 1;
    return next;
  });
  const deleteWhere = vi.fn().mockReturnValue({ returning: deleteReturning });

  const db = {
    select: vi.fn().mockReturnValue({ from: selectFrom }),
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    update: vi.fn().mockReturnValue({ set: updateSet }),
    delete: vi.fn().mockReturnValue({ where: deleteWhere }),
  } as unknown as Database;

  return { db, insertValues, updateSet, updateReturning };
}

describe("OTP service (anti-enumeration, atomic attempts, quota, cleanup)", () => {
  const sendMock = vi.fn().mockResolvedValue(undefined);
  const emailTransport: EmailTransport = { mode: "log", send: sendMock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      retryAfterSec: 60,
      resetAt: new Date("2026-11-25T12:01:00Z"),
    });
    mockIsGlobalCapReached.mockResolvedValue(false);
    mockConsumeGlobalCap.mockResolvedValue(true);
    mockIsInviteValid.mockResolvedValue(false);
  });

  it("does NOT generate OTP, does NOT burn daily cap, and does NOT send email for uninvited unknown emails (returns 200)", async () => {
    const { db, insertValues } = createMockDb({ existingUsers: [] });
    mockIsInviteValid.mockResolvedValue(false);

    const outcome = await requestOtpForEmail(
      { db, env: { BETTER_AUTH_SECRET: TEST_KEY, OTP_DAILY_CAP: 400 }, emailTransport },
      { email: "stranger@example.com", clientIp: "203.0.113.5", inviteCookieValue: null },
    );

    expect(outcome).toEqual({
      status: 200,
      body: { ok: true, retryAfterSec: 60 },
      emailSent: false,
    });
    expect(mockConsumeGlobalCap).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends OTP for existing user without invite cookie and for new user with valid invite cookie", async () => {
    const existingMock = createMockDb({ existingUsers: [{ id: "user-1" }] });
    const existingRes = await requestOtpForEmail(
      { db: existingMock.db, env: { BETTER_AUTH_SECRET: TEST_KEY, OTP_DAILY_CAP: 400 }, emailTransport },
      { email: "existing@example.com", clientIp: "203.0.113.5", inviteCookieValue: null },
    );
    expect(existingRes.status).toBe(200);
    if (existingRes.status === 200) {
      expect(existingRes.emailSent).toBe(true);
    }

    const invitedMock = createMockDb({ existingUsers: [] });
    mockIsInviteValid.mockResolvedValueOnce(true);
    const invitedRes = await requestOtpForEmail(
      { db: invitedMock.db, env: { BETTER_AUTH_SECRET: TEST_KEY, OTP_DAILY_CAP: 400 }, emailTransport },
      { email: "invited@example.com", clientIp: "203.0.113.5", inviteCookieValue: "AB2CD3EF" },
    );
    expect(invitedRes.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("returns 503 when daily cap is reached on peek, race reservation, or SMTP failure (invalidating challenge)", async () => {
    const { db } = createMockDb({ existingUsers: [{ id: "user-1" }] });
    mockIsGlobalCapReached.mockResolvedValueOnce(true);
    const capPeek = await requestOtpForEmail(
      { db, env: { BETTER_AUTH_SECRET: TEST_KEY, OTP_DAILY_CAP: 400 }, emailTransport },
      { email: "existing@example.com", clientIp: "203.0.113.5", inviteCookieValue: null },
    );
    expect(capPeek).toEqual({ status: 503, body: { error: "OTP_DAILY_CAP_REACHED" } });

    mockConsumeGlobalCap.mockResolvedValueOnce(false);
    const capRace = await requestOtpForEmail(
      { db, env: { BETTER_AUTH_SECRET: TEST_KEY, OTP_DAILY_CAP: 400 }, emailTransport },
      { email: "existing@example.com", clientIp: "203.0.113.5", inviteCookieValue: null },
    );
    expect(capRace).toEqual({ status: 503, body: { error: "OTP_DAILY_CAP_REACHED" } });

    const smtpFailMock = createMockDb({ existingUsers: [{ id: "user-1" }] });
    sendMock.mockRejectedValueOnce(new Error("SMTP_DELIVERY_FAILED"));
    const deliveryFail = await requestOtpForEmail(
      { db: smtpFailMock.db, env: { BETTER_AUTH_SECRET: TEST_KEY, OTP_DAILY_CAP: 400 }, emailTransport },
      { email: "existing@example.com", clientIp: "203.0.113.5", inviteCookieValue: null },
    );
    expect(deliveryFail).toEqual({ status: 503, body: { error: "OTP_DELIVERY_UNAVAILABLE" } });
    // Challenge invalidated after failed delivery
    expect(smtpFailMock.updateSet).toHaveBeenCalledTimes(2);
  });

  it("returns 429 with retryAfterSec on request or verify rate limit breach", async () => {
    const { db } = createMockDb({ existingUsers: [{ id: "user-1" }] });
    mockConsumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      count: 6,
      retryAfterSec: 420,
      resetAt: new Date("2026-11-25T12:07:00Z"),
    });
    const reqRl = await requestOtpForEmail(
      { db, env: { BETTER_AUTH_SECRET: TEST_KEY, OTP_DAILY_CAP: 400 }, emailTransport },
      { email: "existing@example.com", clientIp: "203.0.113.5", inviteCookieValue: null },
    );
    expect(reqRl).toEqual({
      status: 429,
      retryAfterSec: 420,
      body: { error: "RATE_LIMITED", retryAfterSec: 420 },
    });

    mockConsumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      count: 11,
      retryAfterSec: 300,
      resetAt: new Date("2026-11-25T12:05:00Z"),
    });
    const verRl = await verifyOtpChallenge(
      { db, env: { BETTER_AUTH_SECRET: TEST_KEY } },
      { email: "existing@example.com", code: "123456", clientIp: "203.0.113.5" },
    );
    expect(verRl).toEqual({
      status: 429,
      retryAfterSec: 300,
      body: { error: "RATE_LIMITED", retryAfterSec: 300 },
    });
  });

  it("returns uniform INVALID_OTP for malformed, missing, wrong (1..5), locked/expired, and replayed OTPs; succeeds atomically on valid code", async () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const validCode = "592014";
    const hashed = hashOtpCode("member@example.com", validCode, TEST_KEY);

    // Malformed format rejected before DB select
    const badFormatMock = createMockDb({ selectRows: [] });
    await expect(
      verifyOtpChallenge(
        { db: badFormatMock.db, env: { BETTER_AUTH_SECRET: TEST_KEY } },
        { email: "member@example.com", code: "12ab", clientIp: "203.0.113.5", now },
      ),
    ).resolves.toEqual({ status: 400, body: { error: "INVALID_OTP" } });

    // Missing challenge (unknown email) -> uniform INVALID_OTP
    const missingMock = createMockDb({ selectRows: [] });
    await expect(
      verifyOtpChallenge(
        { db: missingMock.db, env: { BETTER_AUTH_SECRET: TEST_KEY } },
        { email: "stranger@example.com", code: "000000", clientIp: "203.0.113.5", now },
      ),
    ).resolves.toEqual({ status: 400, body: { error: "INVALID_OTP" } });

    // Atomic attempt claim fails (expired or >= 5 attempts already) -> uniform INVALID_OTP
    const expiredOrLockedMock = createMockDb({
      selectRows: [{ id: "ch-1" }],
      updateReturnSequence: [[]],
    });
    await expect(
      verifyOtpChallenge(
        { db: expiredOrLockedMock.db, env: { BETTER_AUTH_SECRET: TEST_KEY } },
        { email: "member@example.com", code: validCode, clientIp: "203.0.113.5", now },
      ),
    ).resolves.toEqual({ status: 400, body: { error: "INVALID_OTP" } });

    // Wrong code on attempt 1 -> uniform INVALID_OTP (challenge NOT consumed yet)
    const wrongAttempt1 = createMockDb({
      selectRows: [{ id: "ch-2" }],
      updateReturnSequence: [[{ id: "ch-2", codeHash: hashed, attempts: 1, maxAttempts: 5 }]],
    });
    await expect(
      verifyOtpChallenge(
        { db: wrongAttempt1.db, env: { BETTER_AUTH_SECRET: TEST_KEY } },
        { email: "member@example.com", code: "000000", clientIp: "203.0.113.5", now },
      ),
    ).resolves.toEqual({ status: 400, body: { error: "INVALID_OTP" } });
    expect(wrongAttempt1.updateSet).toHaveBeenCalledTimes(1);

    // Wrong code on 5th attempt -> locks (marks consumed) AND still returns uniform INVALID_OTP (no enumeration!)
    const wrongAttempt5 = createMockDb({
      selectRows: [{ id: "ch-3" }],
      updateReturnSequence: [
        [{ id: "ch-3", codeHash: hashed, attempts: 5, maxAttempts: 5 }],
        [{ id: "ch-3" }],
      ],
    });
    await expect(
      verifyOtpChallenge(
        { db: wrongAttempt5.db, env: { BETTER_AUTH_SECRET: TEST_KEY } },
        { email: "member@example.com", code: "000000", clientIp: "203.0.113.5", now },
      ),
    ).resolves.toEqual({ status: 400, body: { error: "INVALID_OTP" } });
    expect(wrongAttempt5.updateSet).toHaveBeenCalledTimes(2);

    // Valid code but concurrent replay lost atomic consume -> uniform INVALID_OTP
    const replayMock = createMockDb({
      selectRows: [{ id: "ch-4" }],
      updateReturnSequence: [
        [{ id: "ch-4", codeHash: hashed, attempts: 1, maxAttempts: 5 }],
        [],
      ],
    });
    await expect(
      verifyOtpChallenge(
        { db: replayMock.db, env: { BETTER_AUTH_SECRET: TEST_KEY } },
        { email: "member@example.com", code: validCode, clientIp: "203.0.113.5", now },
      ),
    ).resolves.toEqual({ status: 400, body: { error: "INVALID_OTP" } });

    // Valid code succeeds atomically
    const validMock = createMockDb({
      selectRows: [{ id: "ch-5" }],
      updateReturnSequence: [
        [{ id: "ch-5", codeHash: hashed, attempts: 1, maxAttempts: 5 }],
        [{ id: "ch-5" }],
      ],
    });
    await expect(
      verifyOtpChallenge(
        { db: validMock.db, env: { BETTER_AUTH_SECRET: TEST_KEY } },
        { email: "Member@Example.com", code: validCode, clientIp: "203.0.113.5", now },
      ),
    ).resolves.toEqual({ status: 200, email: "member@example.com" });
  });

  it("cleans up expired OTP challenges, rate limits, sessions, and verifications", async () => {
    const mock = createMockDb({
      deleteReturnSequence: [
        [{ id: "o1" }, { id: "o2" }],
        [{ key: "r1" }],
        [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
        [{ id: "v1" }],
      ],
    });

    await expect(cleanupExpiredAuthRecords(mock.db)).resolves.toEqual({
      otpChallengesDeleted: 2,
      rateLimitsDeleted: 1,
      sessionsDeleted: 3,
      verificationsDeleted: 1,
    });
  });
});
