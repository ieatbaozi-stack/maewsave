import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db";
import {
  createCategory,
  deleteCategory,
  MAX_CATEGORIES_PER_USER,
  seedStarterCategories,
} from "../categories";
import {
  createTransaction,
  deleteTransaction,
  getLedgerOverview,
  updateTransaction,
} from "../transactions";
import {
  createWallet,
  deleteWallet,
  FinanceServiceError,
  MAX_WALLETS_PER_USER,
  updateWallet,
} from "../wallets";

const USER_1 = "user-1";
const WALLET_A = "11111111-1111-4111-8111-111111111111";
const WALLET_B = "22222222-2222-4222-8222-222222222222";
const CAT_INCOME = "33333333-3333-4333-8333-333333333333";
const TX_1 = "44444444-4444-4444-8444-444444444444";

function createSelectChain(results: unknown[][]) {
  let callIndex = 0;
  return vi.fn(() => {
    const nextRows = () => results[callIndex++] ?? [];
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => nextRows()),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => nextRows()),
          })),
          groupBy: vi.fn(async () => nextRows()),
          then: (resolve: (value: unknown[]) => void) => resolve(nextRows()),
        })),
      })),
    };
  });
}

describe("finance services tenant isolation, caps & invariants", () => {
  it("enforces MAX_WALLETS_PER_USER cap on createWallet (409 LIMIT_REACHED)", async () => {
    const db = {
      select: createSelectChain([[{ total: MAX_WALLETS_PER_USER }]]),
      insert: vi.fn(),
    } as unknown as Database;

    await expect(
      createWallet(db, USER_1, {
        alias: "Wallet Overflow",
        type: "BANK_CASH",
        statementDay: null,
        dueDay: null,
        initialBalanceSatang: 0,
      }),
    ).rejects.toMatchObject({ code: "LIMIT_REACHED", status: 409 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("blocks deleting a wallet that still has transactions (409 IN_USE)", async () => {
    const db = {
      select: createSelectChain([
        [{ id: WALLET_A }],
        [{ id: TX_1 }],
        [],
      ]),
      delete: vi.fn(),
    } as unknown as Database;

    await expect(deleteWallet(db, USER_1, WALLET_A)).rejects.toMatchObject({
      code: "IN_USE",
      status: 409,
    });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("maps concurrent PG 23503 FK violations in deleteWallet to 409 IN_USE", async () => {
    const db = {
      select: createSelectChain([[{ id: WALLET_A }], [], []]),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            throw Object.assign(new Error("fk violation"), { code: "23503" });
          }),
        })),
      })),
    } as unknown as Database;

    await expect(deleteWallet(db, USER_1, WALLET_A)).rejects.toMatchObject({
      code: "IN_USE",
      status: 409,
    });
  });

  it("returns 404 when updating another user's wallet", async () => {
    const db = {
      select: createSelectChain([[]]),
      update: vi.fn(),
    } as unknown as Database;

    await expect(
      updateWallet(db, USER_1, WALLET_A, { alias: "Hijacked" }),
    ).rejects.toBeInstanceOf(FinanceServiceError);
  });

  it("enforces MAX_CATEGORIES_PER_USER cap and maps PG 23505 to 409 CONFLICT", async () => {
    const cappedDb = {
      select: createSelectChain([[{ total: MAX_CATEGORIES_PER_USER }]]),
      insert: vi.fn(),
    } as unknown as Database;

    await expect(
      createCategory(cappedDb, USER_1, {
        name: "Food",
        type: "EXPENSE",
        icon: "utensils",
      }),
    ).rejects.toMatchObject({ code: "LIMIT_REACHED", status: 409 });

    const duplicateDb = {
      select: createSelectChain([[{ total: 2 }]]),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => {
            throw Object.assign(new Error("dup"), { cause: { code: "23505" } });
          }),
        })),
      })),
    } as unknown as Database;

    await expect(
      createCategory(duplicateDb, USER_1, {
        name: "Food",
        type: "EXPENSE",
        icon: "utensils",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("seeds starter categories idempotently with ON CONFLICT DO NOTHING", async () => {
    const onConflictDoNothing = vi.fn(async () => undefined);
    const db = {
      select: createSelectChain([[], []]),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing })),
      })),
    } as unknown as Database;

    await seedStarterCategories(db, USER_1, "en");
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it("executes category cleanup + deletion atomically via db.batch", async () => {
    const batch = vi.fn(async () => [undefined, undefined, [{ id: CAT_INCOME }]]);
    const db = {
      select: createSelectChain([[{ id: CAT_INCOME }]]),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => "update-stmt") })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn(() => "delete-stmt") })),
      })),
      batch,
    } as unknown as Database;

    const result = await deleteCategory(db, USER_1, CAT_INCOME);
    expect(result).toEqual({ id: CAT_INCOME });
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("rejects creating a transaction on an archived wallet (400)", async () => {
    const db = {
      select: createSelectChain([[{ id: WALLET_A, isActive: false }]]),
      insert: vi.fn(),
    } as unknown as Database;

    await expect(
      createTransaction(db, USER_1, {
        type: "EXPENSE",
        amountSatang: 5000,
        walletId: WALLET_A,
        toWalletId: null,
        categoryId: null,
        merchant: "Cafe",
        note: null,
        transactionDate: "2026-11-25",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("rejects mismatched category type on expense creation (400)", async () => {
    const db = {
      select: createSelectChain([
        [{ id: WALLET_A, isActive: true }],
        [{ id: CAT_INCOME, type: "INCOME" }],
      ]),
      insert: vi.fn(),
    } as unknown as Database;

    await expect(
      createTransaction(db, USER_1, {
        type: "EXPENSE",
        amountSatang: 5000,
        walletId: WALLET_A,
        toWalletId: null,
        categoryId: CAT_INCOME,
        merchant: "Cafe",
        note: null,
        transactionDate: "2026-11-25",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("rejects transfer when destination wallet belongs to another user (404)", async () => {
    const db = {
      select: createSelectChain([
        [{ id: WALLET_A, isActive: true }],
        [],
      ]),
      insert: vi.fn(),
    } as unknown as Database;

    await expect(
      createTransaction(db, USER_1, {
        type: "TRANSFER",
        amountSatang: 10_000,
        walletId: WALLET_A,
        toWalletId: WALLET_B,
        categoryId: null,
        merchant: "Pay Card",
        note: null,
        transactionDate: "2026-11-25",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("rejects updateTransaction when transaction belongs to another user (404)", async () => {
    const db = {
      select: createSelectChain([[]]),
      update: vi.fn(),
    } as unknown as Database;

    await expect(
      updateTransaction(db, USER_1, TX_1, {
        type: "EXPENSE",
        amountSatang: 5000,
        walletId: WALLET_A,
        toWalletId: null,
        categoryId: null,
        merchant: "Cafe",
        note: null,
        transactionDate: "2026-11-25",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("computes SQL-aggregated overview balances and credit card cycles without full-table scan", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    const db = {
      select: createSelectChain([
        // 1. listWallets
        [
          {
            id: WALLET_A,
            userId: USER_1,
            alias: "Bank A",
            type: "BANK_CASH",
            statementDay: null,
            dueDay: null,
            initialBalanceSatang: 1_000_000,
            isActive: true,
            createdAt: now,
          },
          {
            id: WALLET_B,
            userId: USER_1,
            alias: "Card A",
            type: "CREDIT_CARD",
            statementDay: 15,
            dueDay: 5,
            initialBalanceSatang: 0,
            isActive: true,
            createdAt: now,
          },
        ],
        // 2. listCategories
        [],
        // 3. listTransactions (month)
        [],
        // 4. monthAggRows
        [
          { type: "EXPENSE", total: "50000" },
          { type: "TRANSFER", total: "50000" },
        ],
        // 5. walletDirectAggRows
        [
          { walletId: WALLET_B, type: "EXPENSE", total: "50000" },
          { walletId: WALLET_A, type: "TRANSFER", total: "50000" },
        ],
        // 6. walletIncomingTransferAggRows
        [{ toWalletId: WALLET_B, total: "50000" }],
        // 7. bounded credit card cycle rows
        [
          {
            type: "EXPENSE",
            amountSatang: 50_000,
            walletId: WALLET_B,
            toWalletId: null,
            transactionDate: "2026-11-20",
          },
          {
            type: "TRANSFER",
            amountSatang: 50_000,
            walletId: WALLET_A,
            toWalletId: WALLET_B,
            transactionDate: "2026-11-25",
          },
        ],
      ]),
    } as unknown as Database;

    const overview = await getLedgerOverview(db, USER_1, {
      month: "2026-11",
      referenceDateIso: "2026-11-25",
    });

    expect(overview.monthlyTotals).toEqual({
      incomeSatang: 0,
      expenseSatang: 50_000,
      transferSatang: 50_000,
      netCashFlowSatang: -50_000,
    });
    expect(overview.walletBalances[WALLET_A]).toBe(950_000);
    expect(overview.walletBalances[WALLET_B]).toBe(0);
    expect(overview.creditCardSummaries[0]?.currentCycleSpendSatang).toBe(50_000);
    expect(overview.creditCardSummaries[0]?.outstandingBalanceSatang).toBe(0);
  });

  it("returns 404 when deleting a non-existent or cross-tenant transaction", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
    } as unknown as Database;

    await expect(deleteTransaction(db, USER_1, TX_1)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});
