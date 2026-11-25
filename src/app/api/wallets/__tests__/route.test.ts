import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/auth-guard";
import { FinanceServiceError } from "@/services/wallets";

const mockRequireSession = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockListWallets = vi.fn();
const mockCreateWallet = vi.fn();
const mockUpdateWallet = vi.fn();
const mockDeleteWallet = vi.fn();

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

vi.mock("@/services/wallets", async () => {
  const actual = await vi.importActual<typeof import("@/services/wallets")>(
    "@/services/wallets",
  );
  return {
    ...actual,
    listWallets: (...args: unknown[]) => mockListWallets(...args),
    createWallet: (...args: unknown[]) => mockCreateWallet(...args),
    updateWallet: (...args: unknown[]) => mockUpdateWallet(...args),
    deleteWallet: (...args: unknown[]) => mockDeleteWallet(...args),
  };
});

import { GET, POST } from "../route";
import { DELETE, PATCH } from "../[id]/route";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("/api/wallets routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  });

  it("returns 401 with no-store when unauthenticated", async () => {
    mockRequireSession.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(new Request("http://localhost:3000/api/wallets"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });

  it("rejects invalid includeInactive query param with 400", async () => {
    mockRequireSession.mockResolvedValueOnce({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });

    const res = await GET(
      new Request("http://localhost:3000/api/wallets?includeInactive=invalid"),
    );
    expect(res.status).toBe(400);
  });

  it("enforces same-origin CSRF check and DB rate limit on POST", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });

    const csrfRes = await POST(
      new Request("http://localhost:3000/api/wallets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example.test",
        },
        body: JSON.stringify({ alias: "Card A", type: "CREDIT_CARD" }),
      }),
    );
    expect(csrfRes.status).toBe(403);

    mockConsumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 42,
    });
    const rlRes = await POST(
      new Request("http://localhost:3000/api/wallets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ alias: "Card A", type: "CREDIT_CARD" }),
      }),
    );
    expect(rlRes.status).toBe(429);
    expect(rlRes.headers.get("x-retry-after")).toBe("42");
    expect(mockCreateWallet).not.toHaveBeenCalled();
  });

  it("creates a wallet cleanly for authenticated same-origin requests", async () => {
    mockRequireSession.mockResolvedValueOnce({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
    mockCreateWallet.mockResolvedValueOnce({
      id: VALID_UUID,
      alias: "Card A",
      type: "CREDIT_CARD",
      statementDay: 15,
      dueDay: 5,
      initialBalanceSatang: 0,
      isActive: true,
      createdAt: "2026-11-25T00:00:00.000Z",
    });

    const res = await POST(
      new Request("http://localhost:3000/api/wallets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          alias: "Card A",
          type: "CREDIT_CARD",
          statementDay: 15,
          dueDay: 5,
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store, private");
    const json = (await res.json()) as { wallet: { alias: string } };
    expect(json.wallet.alias).toBe("Card A");
  });

  it("rejects invalid UUID on PATCH and maps 409 IN_USE on DELETE", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });

    const badPatch = await PATCH(
      new Request("http://localhost:3000/api/wallets/not-a-uuid", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ alias: "Bank B" }),
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(badPatch.status).toBe(400);

    mockDeleteWallet.mockRejectedValueOnce(
      new FinanceServiceError("IN_USE", "In use", 409),
    );
    const conflictDel = await DELETE(
      new Request(`http://localhost:3000/api/wallets/${VALID_UUID}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(conflictDel.status).toBe(409);
  });
});
