import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerEnv = vi.fn();
const mockCleanup = vi.fn();

vi.mock("@/db", () => ({
  getDb: () => ({}),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => mockGetServerEnv(),
}));

vi.mock("@/services/otp", () => ({
  cleanupExpiredAuthRecords: (...args: unknown[]) => mockCleanup(...args),
}));

import { GET } from "@/app/api/cron/cleanup-auth/route";

const TEST_CRON_TOKEN = "abcdefghij".repeat(4);

describe("GET /api/cron/cleanup-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({ CRON_SECRET: TEST_CRON_TOKEN });
  });

  it("returns 401 when Authorization Bearer secret is missing or wrong", async () => {
    const noAuth = await GET(new Request("https://app.example.test/api/cron/cleanup-auth"));
    expect(noAuth.status).toBe(401);

    const wrongAuth = await GET(
      new Request("https://app.example.test/api/cron/cleanup-auth", {
        headers: { Authorization: "Bearer wrong-token" },
      }),
    );
    expect(wrongAuth.status).toBe(401);
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it("runs cleanup and returns deleted counts with valid Bearer CRON_SECRET", async () => {
    mockCleanup.mockResolvedValue({
      otpChallengesDeleted: 3,
      rateLimitsDeleted: 12,
      sessionsDeleted: 1,
      verificationsDeleted: 2,
    });

    const res = await GET(
      new Request("https://app.example.test/api/cron/cleanup-auth", {
        headers: { Authorization: `Bearer ${TEST_CRON_TOKEN}` },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, private");
    await expect(res.json()).resolves.toEqual({
      ok: true,
      deleted: {
        otpChallengesDeleted: 3,
        rateLimitsDeleted: 12,
        sessionsDeleted: 1,
        verificationsDeleted: 2,
      },
    });
  });
});
