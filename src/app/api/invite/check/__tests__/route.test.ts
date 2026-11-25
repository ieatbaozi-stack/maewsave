import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConsumeRateLimit = vi.fn();
const mockIsInviteValid = vi.fn();
const mockGetServerEnv = vi.fn();

vi.mock("@/db", () => ({
  getDb: () => ({}),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => mockGetServerEnv(),
}));

vi.mock("@/services/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

vi.mock("@/services/invitations", () => ({
  isInviteCodeCurrentlyValid: (...args: unknown[]) => mockIsInviteValid(...args),
}));

import { POST } from "@/app/api/invite/check/route";

describe("POST /api/invite/check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.test",
    });
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      retryAfterSec: 600,
      resetAt: new Date("2026-11-25T12:10:00Z"),
    });
  });

  it("sets HttpOnly Secure SameSite=Lax cookie for a valid invite code", async () => {
    mockIsInviteValid.mockResolvedValue(true);

    const request = new Request("https://app.example.test/api/invite/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://app.example.test",
      },
      body: JSON.stringify({ code: "ab2c-d3ef" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");

    const setCookie = response.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("maewsave_invite=AB2CD3EF");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");
  });

  it("returns uniform 400 invalid error for nonexistent/expired/revoked/malformed codes", async () => {
    mockIsInviteValid.mockResolvedValue(false);

    const malformedRes = await POST(
      new Request("https://app.example.test/api/invite/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.example.test",
        },
        body: JSON.stringify({ code: "0000-1111" }),
      }),
    );
    const inactiveRes = await POST(
      new Request("https://app.example.test/api/invite/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.example.test",
        },
        body: JSON.stringify({ code: "AB2C-D3EF" }),
      }),
    );

    expect(malformedRes.status).toBe(400);
    expect(inactiveRes.status).toBe(400);
    await expect(malformedRes.json()).resolves.toEqual({ error: "invalid" });
    await expect(inactiveRes.json()).resolves.toEqual({ error: "invalid" });
    expect(inactiveRes.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("rejects cross-origin requests with 403 and rate-limited requests with 429 + X-Retry-After", async () => {
    const csrfRes = await POST(
      new Request("https://app.example.test/api/invite/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example.test",
        },
        body: JSON.stringify({ code: "AB2C-D3EF" }),
      }),
    );
    expect(csrfRes.status).toBe(403);

    mockConsumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      count: 11,
      retryAfterSec: 320,
      resetAt: new Date("2026-11-25T12:05:20Z"),
    });

    const rlRes = await POST(
      new Request("https://app.example.test/api/invite/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.example.test",
        },
        body: JSON.stringify({ code: "AB2C-D3EF" }),
      }),
    );
    expect(rlRes.status).toBe(429);
    expect(rlRes.headers.get("X-Retry-After")).toBe("320");
  });
});
