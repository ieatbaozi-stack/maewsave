import type { WalletType } from "@/db/finance-schema";
import { getMonthRange } from "./billing-cycle";
import type { LedgerOverview, SerializedTransaction } from "./ledger-types";

function walletBalanceDeltaForTransaction(
  walletId: string,
  walletType: WalletType,
  tx: SerializedTransaction,
  sign: 1 | -1,
): number {
  let baseDelta = 0;

  if (walletType === "CREDIT_CARD") {
    if (tx.type === "EXPENSE" && tx.walletId === walletId) {
      baseDelta += tx.amountSatang;
    } else if (tx.type === "INCOME" && tx.walletId === walletId) {
      baseDelta -= tx.amountSatang;
    } else if (tx.type === "TRANSFER") {
      if (tx.walletId === walletId) {
        baseDelta += tx.amountSatang;
      }
      if (tx.toWalletId === walletId) {
        baseDelta -= tx.amountSatang;
      }
    }
  } else {
    if (tx.type === "INCOME" && tx.walletId === walletId) {
      baseDelta += tx.amountSatang;
    } else if (tx.type === "EXPENSE" && tx.walletId === walletId) {
      baseDelta -= tx.amountSatang;
    } else if (tx.type === "TRANSFER") {
      if (tx.walletId === walletId) {
        baseDelta -= tx.amountSatang;
      }
      if (tx.toWalletId === walletId) {
        baseDelta += tx.amountSatang;
      }
    }
  }

  return baseDelta * sign;
}

function isTxInRange(tx: SerializedTransaction, startDate: string, endDate: string): boolean {
  return tx.transactionDate >= startDate && tx.transactionDate <= endDate;
}

function sortTransactionsDesc(
  items: readonly SerializedTransaction[],
): SerializedTransaction[] {
  return [...items].sort((a, b) => {
    if (a.transactionDate !== b.transactionDate) {
      return b.transactionDate.localeCompare(a.transactionDate);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function applyTransactionMutationToOverview(
  overview: LedgerOverview,
  removed: SerializedTransaction | null,
  added: SerializedTransaction | null,
): LedgerOverview {
  const monthRange = getMonthRange(overview.month);
  let nextTransactions = overview.transactions;

  if (removed) {
    nextTransactions = nextTransactions.filter((item) => item.id !== removed.id);
  }
  if (
    added &&
    monthRange &&
    isTxInRange(added, monthRange.startDate, monthRange.endDate)
  ) {
    nextTransactions = sortTransactionsDesc([
      added,
      ...nextTransactions.filter((item) => item.id !== added.id),
    ]);
  }

  // Incremental monthlyTotals update (keeps exact totals even if month list was capped)
  let { incomeSatang, expenseSatang, transferSatang } = overview.monthlyTotals;
  if (
    removed &&
    monthRange &&
    isTxInRange(removed, monthRange.startDate, monthRange.endDate)
  ) {
    if (removed.type === "INCOME") {
      incomeSatang -= removed.amountSatang;
    } else if (removed.type === "EXPENSE") {
      expenseSatang -= removed.amountSatang;
    } else {
      transferSatang -= removed.amountSatang;
    }
  }
  if (
    added &&
    monthRange &&
    isTxInRange(added, monthRange.startDate, monthRange.endDate)
  ) {
    if (added.type === "INCOME") {
      incomeSatang += added.amountSatang;
    } else if (added.type === "EXPENSE") {
      expenseSatang += added.amountSatang;
    } else {
      transferSatang += added.amountSatang;
    }
  }

  const nextWalletBalances: Record<string, number> = { ...overview.walletBalances };
  for (const wallet of overview.wallets) {
    let balance = nextWalletBalances[wallet.id] ?? wallet.initialBalanceSatang;
    if (removed) {
      balance += walletBalanceDeltaForTransaction(wallet.id, wallet.type, removed, -1);
    }
    if (added) {
      balance += walletBalanceDeltaForTransaction(wallet.id, wallet.type, added, 1);
    }
    nextWalletBalances[wallet.id] = balance;
  }

  const nextCreditCardSummaries = overview.creditCardSummaries.map((card) => {
    let currentCycleSpendSatang = card.currentCycleSpendSatang;
    let currentCyclePaymentSatang = card.currentCyclePaymentSatang;

    const applyCycleDelta = (tx: SerializedTransaction, sign: 1 | -1) => {
      if (!isTxInRange(tx, card.cycle.startDate, card.cycle.endDate)) {
        return;
      }
      if (tx.type === "EXPENSE" && tx.walletId === card.walletId) {
        currentCycleSpendSatang += tx.amountSatang * sign;
      } else if (tx.type === "INCOME" && tx.walletId === card.walletId) {
        currentCycleSpendSatang -= tx.amountSatang * sign;
      } else if (tx.type === "TRANSFER" && tx.toWalletId === card.walletId) {
        currentCyclePaymentSatang += tx.amountSatang * sign;
      }
    };

    if (removed) {
      applyCycleDelta(removed, -1);
    }
    if (added) {
      applyCycleDelta(added, 1);
    }

    return {
      ...card,
      currentCycleSpendSatang,
      currentCyclePaymentSatang,
      outstandingBalanceSatang:
        nextWalletBalances[card.walletId] ?? card.outstandingBalanceSatang,
    };
  });

  return {
    ...overview,
    transactions: nextTransactions,
    monthlyTotals: {
      incomeSatang,
      expenseSatang,
      transferSatang,
      netCashFlowSatang: incomeSatang - expenseSatang,
    },
    walletBalances: nextWalletBalances,
    creditCardSummaries: nextCreditCardSummaries,
  };
}
