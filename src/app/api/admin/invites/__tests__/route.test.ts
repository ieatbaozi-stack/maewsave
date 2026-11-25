import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSuperAdminSession = vi.fn();
const mockGetServerEnv = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockListInvitations = vi.fn();
const mockCreateInvitation = vi.fn();
const mockRevokeInvitation = vi.fn();

vi.mock("@/db", () => ({
  getDb: () => ({}),
}));

vi.mock("@/lib/auth-guard", () => ({
  getSuperAdminSession: (...args: unknown[]) => mockGetSuperAdminSession(...args),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => mockGetServerEnv(),
}));

vi.mock("@/services/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

vi.mock("@/services/invitations", () => ({
  listInvitations: (...args: unknown[]) => mockListInvitations(...args),
  createInvitation: (...args: unknown[]) => mockCreateInvitation(...args),
  revokeInvitation: (...args: unknown[]) => mockRevokeInvitation(...args),
}));

import { DELETE, GET, POST } from "@/app/api/admin/invites/route";
import { GET as revokeGet, POST as revokePost } from "@/app/api/admin/invites/[id]/revoke/route";

describe("Super Admin invitation APIs (/api/admin/invites*)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({
      BETTER_AUTH_URL: "https://app.example.test",
    });
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      retryAfterSec: 3600,
      resetAt: new Date("2026-11-26T00:00:00Z"),
    });
  });

  it("always returns 404 with no-store for non-Super-Admins across GET, POST, and revoke", async () => {
    mockGetSuperAdminSession.mockResolvedValue(null);

    const getRes = await GET(new Request("https://app.example.test/api/admin/invites"));
    const postRes = await POST(
      new Request("https://app.example.test/api/admin/invites", {
        method: "POST",
        headers: { Origin: "https://app.example.test" },
      }),
    );
    const revokeRes = await revokePost(
      new Request("https://app.example.test/api/admin/invites/1/revoke", {
        method: "POST",
        headers: { Origin: "https://app.example.test" },
      }),
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) },
    );

    expect(getRes.status).toBe(404);
    expect(postRes.status).toBe(404);
    expect(revokeRes.status).toBe(404);
    expect((await DELETE()).status).toBe(404);
    expect((await revokeGet()).status).toBe(404);
    expect(getRes.headers.get("Cache-Control")).toBe("no-store, private");
    expect(postRes.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("enforces Origin CSRF check and 20/day rate limit for Super Admin invite creation", async () => {
    mockGetSuperAdminSession.mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      image: null,
    });

    const csrfRes = await POST(
      new Request("https://app.example.test/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example.test",
        },
        body: JSON.stringify({ label: "Test", expiresInDays: 7, maxUses: 1 }),
      }),
    );
    expect(csrfRes.status).toBe(403);

    mockConsumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      count: 21,
      retryAfterSec: 1200,
      resetAt: new Date("2026-11-26T00:00:00Z"),
    });
    const rlRes = await POST(
      new Request("https://app.example.test/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.example.test",
        },
        body: JSON.stringify({ label: "Test", expiresInDays: 7, maxUses: 1 }),
      }),
    );
    expect(rlRes.status).toBe(429);
    expect(rlRes.headers.get("X-Retry-After")).toBe("1200");
  });

  it("creates, lists, and revokes invitations cleanly for Super Admin", async () => {
    mockGetSuperAdminSession.mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      image: null,
    });

    mockCreateInvitation.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      label: "Family",
      status: "active",
      usesCount: 0,
      maxUses: 2,
      expiresAt: "2026-12-02T00:00:00.000Z",
      revokedAt: null,
      createdAt: "2026-11-25T00:00:00.000Z",
      code: "AB2C-D3EF",
      inviteUrl: "https://app.example.test/sign-in#invite=AB2C-D3EF",
    });

    const createRes = await POST(
      new Request("https://app.example.test/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.example.test",
        },
        body: JSON.stringify({ label: "Family", expiresInDays: 7, maxUses: 2 }),
      }),
    );
    expect(createRes.status).toBe(201);
    expect(createRes.headers.get("Cache-Control")).toBe("no-store, private");

    mockListInvitations.mockResolvedValue([]);
    const listRes = await GET(new Request("https://app.example.test/api/admin/invites"));
    expect(listRes.status).toBe(200);

    mockRevokeInvitation.mockResolvedValue(true);
    const revokeRes = await revokePost(
      new Request("https://app.example.test/api/admin/invites/550e8400-e29b-41d4-a716-446655440000/revoke", {
        method: "POST",
        headers: { Origin: "https://app.example.test" },
      }),
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) },
    );
    expect(revokeRes.status).toBe(200);
  });
});
