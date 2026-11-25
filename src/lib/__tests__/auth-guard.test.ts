import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockIsSuperAdmin = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => mockNotFound(),
}));

vi.mock("@/db", () => ({
  getDb: () => ({}),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: mockGetSession,
    },
  }),
}));

vi.mock("@/services/invitations", () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}));

import {
  getAuthorizedSession,
  getSuperAdminSession,
  requireAuthorizedSession,
  requireAuthorizedSessionOrRedirect,
  requireSuperAdminPageOrNotFound,
  UnauthorizedError,
} from "@/lib/auth-guard";

describe("session and Super Admin authorization guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuperAdmin.mockResolvedValue(false);
  });

  it("returns null when Better Auth session is missing or emailVerified is false", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    await expect(getAuthorizedSession(new Headers())).resolves.toBeNull();

    mockGetSession.mockResolvedValueOnce({
      user: {
        id: "u1",
        email: "member@example.com",
        emailVerified: false,
        name: "Member",
        image: null,
      },
    });
    await expect(getAuthorizedSession(new Headers())).resolves.toBeNull();
  });

  it("returns AuthorizedSession for verified authenticated users", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "u1",
        email: "member@example.com",
        emailVerified: true,
        name: "Member",
        image: null,
      },
    });

    await expect(getAuthorizedSession(new Headers())).resolves.toEqual({
      userId: "u1",
      email: "member@example.com",
      name: "Member",
      image: null,
    });
  });

  it("requireAuthorizedSession throws UnauthorizedError and requireAuthorizedSessionOrRedirect redirects fail-closed", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(requireAuthorizedSession(new Headers())).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    mockGetSession.mockRejectedValue(new Error("DB error"));
    await expect(requireAuthorizedSessionOrRedirect(new Headers())).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in");
  });

  it("enforces Super Admin DB check on every request and triggers 404 notFound for non-admins", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "u-regular",
        email: "member@example.com",
        emailVerified: true,
        name: "Member",
        image: null,
      },
    });
    mockIsSuperAdmin.mockResolvedValueOnce(false);

    await expect(getSuperAdminSession(new Headers())).resolves.toBeNull();

    mockIsSuperAdmin.mockResolvedValueOnce(false);
    await expect(requireSuperAdminPageOrNotFound(new Headers())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockNotFound).toHaveBeenCalledTimes(1);

    mockIsSuperAdmin.mockResolvedValueOnce(true);
    await expect(requireSuperAdminPageOrNotFound(new Headers())).resolves.toEqual({
      userId: "u-regular",
      email: "member@example.com",
      name: "Member",
      image: null,
    });
  });
});
