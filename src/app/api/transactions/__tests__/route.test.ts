import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/auth-guard";
import { FinanceServiceError } from "@/services/wallets";

const mockRequireSession = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockListTransactions = vi.fn();
const mockGetLedgerOverview = vi.fn();
const mockCreateTransaction = vi.fn();
const mockUpdateTransaction = vi.fn();
const mockDeleteTransaction = vi.fn();

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

vi.mock("@/services/transactions", () => ({
  listTransactions: (...args: unknown[]) => mockListTransactions(...args),
  getLedgerOverview: (...args: unknown[]) => mockGetLedgerOverview(...args),
  createTransaction: (...args: unknown[]) => mockCreateTransaction(...args),
  updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args),
  deleteTransaction: (...args: unknown[]) => mockDeleteTransaction(...args),
}));

import { GET, POST } from "../route";
import { DELETE, PATCH } from "../[id]/route";

const WALLET_A = "11111111-1111-4111-8111-111111111111";
const WALLET_B = "22222222-2222-4222-8222-222222222222";
const TX_ID = "44444444-4444-4444-8444-444444444444";

describe("/api/transactions routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  });

  it("blocks unauthenticated requests with 401", async () => {
    mockRequireSession.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(new Request("http://localhost:3000/api/transactions"));
    expect(res.status).toBe(401);
  });

  it("rejects invalid month, year 0000, and invalid overview flags with 400", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
    const badMonth = await GET(
      new Request("http://localhost:3000/api/transactions?month=2026-99"),
    );
    expect(badMonth.status).toBe(400);

    const zeroYear = await GET(
      new Request("http://localhost:3000/api/transactions?month=0000-01"),
    );
    expect(zeroYear.status).toBe(400);

    const badOverview = await GET(
      new Request("http://localhost:3000/api/transactions?overview=invalid"),
    );
    expect(badOverview.status).toBe(400);
  });

  it("serves GET ?overview=1 with rate limiting and no-store header", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
    mockGetLedgerOverview.mockResolvedValueOnce({
      month: "2026-11",
      referenceDateIso: "2026-11-25",
      wallets: [],
      categories: [],
      transactions: [],
      monthlyTotals: {
        incomeSatang: 0,
        expenseSatang: 0,
        transferSatang: 0,
        netCashFlowSatang: 0,
      },
      walletBalances: {},
      creditCardSummaries: [],
    });

    const okRes = await GET(
      new Request("http://localhost:3000/api/transactions?overview=1&month=2026-11"),
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("cache-control")).toBe("no-store, private");
    expect(mockGetLedgerOverview).toHaveBeenCalledWith({}, "user-1", {
      month: "2026-11",
    });

    mockConsumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 15,
    });
    const limitedRes = await GET(
      new Request("http://localhost:3000/api/transactions?overview=1&month=2026-11"),
    );
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers.get("x-retry-after")).toBe("15");
  });

  it("rejects cross-origin POST with 403 and invalid transfer payloads with 400", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });

    const csrfRes = await POST(
      new Request("http://localhost:3000/api/transactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example.test",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(csrfRes.status).toBe(403);

    const badTransfer = await POST(
      new Request("http://localhost:3000/api/transactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          type: "TRANSFER",
          amountSatang: 50_000,
          walletId: WALLET_A,
          toWalletId: WALLET_A,
          merchant: "Pay Self",
          transactionDate: "2026-11-25",
        }),
      }),
    );
    expect(badTransfer.status).toBe(400);
  });

  it("creates a transfer and maps 404 for cross-tenant PATCH/DELETE", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });

    mockCreateTransaction.mockResolvedValueOnce({
      id: TX_ID,
      type: "TRANSFER",
      amountSatang: 100_000,
      walletId: WALLET_A,
      toWalletId: WALLET_B,
      categoryId: null,
      merchant: "Pay Card A",
      note: null,
      transactionDate: "2026-11-25",
      source: "MANUAL",
      isReconciled: false,
      createdAt: "2026-11-25T00:00:00.000Z",
      updatedAt: "2026-11-25T00:00:00.000Z",
    });

    const createdRes = await POST(
      new Request("http://localhost:3000/api/transactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          type: "TRANSFER",
          amountSatang: 100_000,
          walletId: WALLET_A,
          toWalletId: WALLET_B,
          merchant: "Pay Card A",
          transactionDate: "2026-11-25",
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    expect(createdRes.headers.get("cache-control")).toBe("no-store, private");

    mockUpdateTransaction.mockRejectedValueOnce(
      new FinanceServiceError("NOT_FOUND", "Not found", 404),
    );
    const patchRes = await PATCH(
      new Request(`http://localhost:3000/api/transactions/${TX_ID}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          type: "EXPENSE",
          amountSatang: 5000,
          walletId: WALLET_A,
          merchant: "Coffee",
          transactionDate: "2026-11-25",
        }),
      }),
      { params: Promise.resolve({ id: TX_ID }) },
    );
    expect(patchRes.status).toBe(404);

    mockDeleteTransaction.mockRejectedValueOnce(
      new FinanceServiceError("NOT_FOUND", "Not found", 404),
    );
    const delRes = await DELETE(
      new Request(`http://localhost:3000/api/transactions/${TX_ID}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: TX_ID }) },
    );
    expect(delRes.status).toBe(404);
  });
});
