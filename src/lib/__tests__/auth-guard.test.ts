import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAllowedEmail, normalizeEmail } from "@/lib/email-whitelist";

const mockGetSession = vi.fn();
const mockGetServerEnv = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: mockGetSession,
    },
  }),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => mockGetServerEnv(),
}));

import {
  getAuthorizedSession,
  requireAuthorizedSession,
  requireAuthorizedSessionOrRedirect,
  UnauthorizedError,
} from "@/lib/auth-guard";

describe("email whitelist guard", () => {
  it("normalizes casing and surrounding whitespace", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("allows exact email match regardless of case or whitespace", () => {
    expect(isAllowedEmail("owner@example.com", "owner@example.com")).toBe(true);
    expect(isAllowedEmail("OWNER@EXAMPLE.COM", "owner@example.com")).toBe(true);
    expect(isAllowedEmail("  owner@example.com  ", "Owner@Example.com")).toBe(true);
  });

  it("rejects non-matching, empty, or spoofed email addresses", () => {
    expect(isAllowedEmail("attacker@example.com", "owner@example.com")).toBe(false);
    expect(isAllowedEmail("owner@example.com.evil.test", "owner@example.com")).toBe(false);
    expect(isAllowedEmail("owner+alias@example.com", "owner@example.com")).toBe(false);
    expect(isAllowedEmail("", "owner@example.com")).toBe(false);
    expect(isAllowedEmail("   ", "owner@example.com")).toBe(false);
    expect(isAllowedEmail("owner@example.com", "")).toBe(false);
    expect(isAllowedEmail(null, "owner@example.com")).toBe(false);
    expect(isAllowedEmail(undefined, "owner@example.com")).toBe(false);
  });
});

describe("session authorization guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({
      ALLOWED_USER_EMAIL: "owner@example.com",
    });
  });

  it("returns null when Better Auth session is missing", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(getAuthorizedSession(new Headers())).resolves.toBeNull();
  });

  it("rejects sessions where emailVerified is not true", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "u1",
        email: "owner@example.com",
        emailVerified: false,
        name: "Owner",
        image: null,
      },
    });
    await expect(getAuthorizedSession(new Headers())).resolves.toBeNull();
  });

  it("rejects verified sessions with a non-whitelisted email", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "u2",
        email: "other@example.com",
        emailVerified: true,
        name: "Other",
        image: null,
      },
    });
    await expect(getAuthorizedSession(new Headers())).resolves.toBeNull();
  });

  it("returns AuthorizedSession for verified whitelisted owner", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "u1",
        email: "OWNER@example.com",
        emailVerified: true,
        name: "Owner",
        image: null,
      },
    });

    await expect(getAuthorizedSession(new Headers())).resolves.toEqual({
      userId: "u1",
      email: "OWNER@example.com",
      name: "Owner",
      image: null,
    });
  });

  it("requireAuthorizedSession throws UnauthorizedError when unauthorized", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(requireAuthorizedSession(new Headers())).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("requireAuthorizedSessionOrRedirect redirects to /sign-in when unauthorized or errored", async () => {
    mockGetSession.mockRejectedValue(new Error("DB unavailable"));
    await expect(requireAuthorizedSessionOrRedirect(new Headers())).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in");
  });
});
