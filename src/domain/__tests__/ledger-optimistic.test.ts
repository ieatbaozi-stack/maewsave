import { describe, expect, it } from "vitest";
import type { LedgerOverview, SerializedTransaction } from "../ledger-types";
import { applyTransactionMutationToOverview } from "../ledger-optimistic";

const baseOverview: LedgerOverview = {
  month: "2026-11",
  referenceDateIso: "2026-11-25",
  wallets: [
    {
      id: "bank-a",
      alias: "Bank A",
      type: "BANK_CASH",
      statementDay: null,
      dueDay: null,
      initialBalanceSatang: 1_000_000,
      isActive: true,
      createdAt: "2026-11-01T00:00:00.000Z",
    },
    {
      id: "ewallet-a",
      alias: "E-Wallet A",
      type: "EWALLET",
      statementDay: null,
      dueDay: null,
      initialBalanceSatang: 200_000,
      isActive: true,
      createdAt: "2026-11-01T00:00:00.000Z",
    },
    {
      id: "card-a",
      alias: "Card A",
      type: "CREDIT_CARD",
      statementDay: 15,
      dueDay: 5,
      initialBalanceSatang: 0,
      isActive: true,
      createdAt: "2026-11-01T00:00:00.000Z",
    },
  ],
  categories: [],
  transactions: [],
  monthlyTotals: {
    incomeSatang: 0,
    expenseSatang: 0,
    transferSatang: 0,
    netCashFlowSatang: 0,
  },
  walletBalances: {
    "bank-a": 1_000_000,
    "ewallet-a": 200_000,
    "card-a": 0,
  },
  creditCardSummaries: [
    {
      walletId: "card-a",
      alias: "Card A",
      statementDay: 15,
      dueDay: 5,
      cycle: {
        startDate: "2026-11-16",
        endDate: "2026-12-15",
        statementDate: "2026-12-15",
        dueDate: "2027-01-05",
      },
      currentCycleSpendSatang: 0,
      currentCyclePaymentSatang: 0,
      outstandingBalanceSatang: 0,
    },
  ],
};

function makeTx(
  overrides: Partial<SerializedTransaction> & Pick<SerializedTransaction, "id" | "type" | "amountSatang" | "walletId">,
): SerializedTransaction {
  return {
    toWalletId: null,
    categoryId: null,
    merchant: "Test Item",
    note: null,
    transactionDate: "2026-11-20",
    source: "MANUAL",
    isReconciled: false,
    createdAt: "2026-11-20T09:00:00.000Z",
    updatedAt: "2026-11-20T09:00:00.000Z",
    ...overrides,
  };
}

describe("src/domain/ledger-optimistic", () => {
  it("updates card swipe and bank-to-card payment without double-counting monthly spending", () => {
    const swipeCard = makeTx({
      id: "tx-1",
      type: "EXPENSE",
      amountSatang: 50_000,
      walletId: "card-a",
      merchant: "Coffee",
      transactionDate: "2026-11-20",
    });

    const payCard = makeTx({
      id: "tx-2",
      type: "TRANSFER",
      amountSatang: 50_000,
      walletId: "bank-a",
      toWalletId: "card-a",
      merchant: "Pay Card A",
      transactionDate: "2026-11-25",
    });

    const afterSwipe = applyTransactionMutationToOverview(baseOverview, null, swipeCard);
    expect(afterSwipe.monthlyTotals.expenseSatang).toBe(50_000);
    expect(afterSwipe.creditCardSummaries[0]?.outstandingBalanceSatang).toBe(50_000);
    expect(afterSwipe.creditCardSummaries[0]?.currentCycleSpendSatang).toBe(50_000);

    const afterPay = applyTransactionMutationToOverview(afterSwipe, null, payCard);
    expect(afterPay.monthlyTotals.expenseSatang).toBe(50_000);
    expect(afterPay.monthlyTotals.transferSatang).toBe(50_000);
    expect(afterPay.walletBalances["bank-a"]).toBe(950_000);
    expect(afterPay.creditCardSummaries[0]?.outstandingBalanceSatang).toBe(0);
    expect(afterPay.creditCardSummaries[0]?.currentCycleSpendSatang).toBe(50_000);
    expect(afterPay.creditCardSummaries[0]?.currentCyclePaymentSatang).toBe(50_000);

    const afterUndo = applyTransactionMutationToOverview(afterPay, payCard, null);
    expect(afterUndo.walletBalances["bank-a"]).toBe(1_000_000);
    expect(afterUndo.creditCardSummaries[0]?.outstandingBalanceSatang).toBe(50_000);
    expect(afterUndo.monthlyTotals.transferSatang).toBe(0);
    expect(afterUndo.transactions).toHaveLength(1);
  });

  it("handles asset INCOME, EXPENSE, incoming TRANSFER, and credit card INCOME/outgoing TRANSFER", () => {
    const salary = makeTx({
      id: "tx-inc",
      type: "INCOME",
      amountSatang: 500_000,
      walletId: "bank-a",
      transactionDate: "2026-11-01",
    });
    const lunch = makeTx({
      id: "tx-exp",
      type: "EXPENSE",
      amountSatang: 15_000,
      walletId: "bank-a",
      transactionDate: "2026-11-18",
    });
    const topUp = makeTx({
      id: "tx-topup",
      type: "TRANSFER",
      amountSatang: 100_000,
      walletId: "ewallet-a",
      toWalletId: "bank-a",
      transactionDate: "2026-11-19",
    });
    const cashback = makeTx({
      id: "tx-cb",
      type: "INCOME",
      amountSatang: 10_000,
      walletId: "card-a",
      transactionDate: "2026-11-22",
    });
    const cashAdvance = makeTx({
      id: "tx-adv",
      type: "TRANSFER",
      amountSatang: 40_000,
      walletId: "card-a",
      toWalletId: "ewallet-a",
      transactionDate: "2026-11-23",
    });

    let state = applyTransactionMutationToOverview(baseOverview, null, salary);
    state = applyTransactionMutationToOverview(state, null, lunch);
    state = applyTransactionMutationToOverview(state, null, topUp);
    state = applyTransactionMutationToOverview(state, null, cashback);
    state = applyTransactionMutationToOverview(state, null, cashAdvance);

    expect(state.walletBalances["bank-a"]).toBe(1_585_000);
    expect(state.walletBalances["ewallet-a"]).toBe(140_000);
    expect(state.walletBalances["card-a"]).toBe(30_000); // -10_000 cashback + 40_000 advance
    expect(state.creditCardSummaries[0]?.currentCycleSpendSatang).toBe(-10_000);
    expect(state.monthlyTotals).toEqual({
      incomeSatang: 510_000,
      expenseSatang: 15_000,
      transferSatang: 140_000,
      netCashFlowSatang: 495_000,
    });
  });

  it("handles transaction updates across months, billing cycles, and same-date createdAt sorting", () => {
    const earlier = makeTx({
      id: "tx-a",
      type: "EXPENSE",
      amountSatang: 20_000,
      walletId: "card-a",
      transactionDate: "2026-11-20",
      createdAt: "2026-11-20T08:00:00.000Z",
    });
    const laterSameDay = makeTx({
      id: "tx-b",
      type: "EXPENSE",
      amountSatang: 30_000,
      walletId: "card-a",
      transactionDate: "2026-11-20",
      createdAt: "2026-11-20T12:00:00.000Z",
    });

    let state = applyTransactionMutationToOverview(baseOverview, null, earlier);
    state = applyTransactionMutationToOverview(state, null, laterSameDay);

    // Same date sorts descending by createdAt
    expect(state.transactions.map((t) => t.id)).toEqual(["tx-b", "tx-a"]);

    // Move tx-b into prior month & outside current billing cycle (Oct 10)
    const movedOut: SerializedTransaction = {
      ...laterSameDay,
      amountSatang: 35_000,
      transactionDate: "2026-10-10",
    };
    state = applyTransactionMutationToOverview(state, laterSameDay, movedOut);

    // Removed from Nov list & Nov monthly totals, removed from current cycle spend, but outstanding updated
    expect(state.transactions.map((t) => t.id)).toEqual(["tx-a"]);
    expect(state.monthlyTotals.expenseSatang).toBe(20_000);
    expect(state.creditCardSummaries[0]?.currentCycleSpendSatang).toBe(20_000);
    expect(state.creditCardSummaries[0]?.outstandingBalanceSatang).toBe(55_000);
  });
});
