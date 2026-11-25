import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/auth-guard";

const mockRequireSession = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockListCategories = vi.fn();
const mockCreateCategory = vi.fn();
const mockSeedCategories = vi.fn();
const mockUpdateCategory = vi.fn();
const mockDeleteCategory = vi.fn();

vi.mock("@/db", () => ({
  getDb: () => ({}),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    BETTER_AUTH_URL: "http://localhost:3000",
  }),
}));

vi.mock("@/services/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

vi.mock("@/lib/auth-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-guard")>(
    "@/lib/auth-guard",
  );
  return {
    ...actual,
    requireAuthorizedSession: (...args: unknown[]) => mockRequireSession(...args),
  };
});

vi.mock("@/services/categories", () => ({
  listCategories: (...args: unknown[]) => mockListCategories(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  seedStarterCategories: (...args: unknown[]) => mockSeedCategories(...args),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
}));

import { GET, POST } from "../route";
import { DELETE, PATCH } from "../[id]/route";

const CAT_ID = "33333333-3333-4333-8333-333333333333";

describe("/api/categories routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  });

  it("blocks unauthenticated GET with 401 and no-store", async () => {
    mockRequireSession.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(new Request("http://localhost:3000/api/categories"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });

  it("supports starter category seeding with hourly rate limit and rejects invalid icons", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
    mockSeedCategories.mockResolvedValueOnce([
      {
        id: CAT_ID,
        name: "Food & Drink",
        type: "EXPENSE",
        icon: "utensils",
        createdAt: "2026-11-25T00:00:00.000Z",
      },
    ]);

    const seedRes = await POST(
      new Request("http://localhost:3000/api/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ action: "seed", locale: "en" }),
      }),
    );
    expect(seedRes.status).toBe(201);
    expect(mockSeedCategories).toHaveBeenCalledWith({}, "user-1", "en");
    expect(mockConsumeRateLimit).toHaveBeenCalledTimes(2); // mutation RL + hourly seed RL

    const invalidIconRes = await POST(
      new Request("http://localhost:3000/api/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          name: "Food",
          type: "EXPENSE",
          icon: "<script>",
        }),
      }),
    );
    expect(invalidIconRes.status).toBe(400);
  });

  it("enforces same-origin on PATCH and validates UUID on DELETE", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });

    const csrfRes = await PATCH(
      new Request(`http://localhost:3000/api/categories/${CAT_ID}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example.test",
        },
        body: JSON.stringify({ name: "Coffee" }),
      }),
      { params: Promise.resolve({ id: CAT_ID }) },
    );
    expect(csrfRes.status).toBe(403);

    const badUuidDel = await DELETE(
      new Request("http://localhost:3000/api/categories/bad-id", {
        method: "DELETE",
        headers: { origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: "bad-id" }) },
    );
    expect(badUuidDel.status).toBe(400);
  });
});
