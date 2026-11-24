import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthorizedSession = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  getAuthorizedSession: (headers: Headers) => mockGetAuthorizedSession(headers),
}));

import { GET } from "@/app/api/session/route";

describe("GET /api/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 with Cache-Control: no-store when unauthenticated", async () => {
    mockGetAuthorizedSession.mockResolvedValue(null);
    const response = await GET(new Request("https://app.example.test/api/session"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("fails closed with 401 if session verification throws", async () => {
    mockGetAuthorizedSession.mockRejectedValue(new Error("boom"));
    const response = await GET(new Request("https://app.example.test/api/session"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("returns 200 with owner identity and Cache-Control: no-store when authorized", async () => {
    mockGetAuthorizedSession.mockResolvedValue({
      userId: "u1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
    const response = await GET(new Request("https://app.example.test/api/session"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      user: {
        id: "u1",
        email: "owner@example.com",
        name: "Owner",
      },
    });
  });
});
