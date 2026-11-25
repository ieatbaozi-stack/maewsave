import type {
  CategoryType,
  TransactionSource,
  TransactionType,
  WalletType,
} from "@/db/finance-schema";
import type { CreditCardCycleSummary } from "./billing-cycle";
import type { MonthlyLedgerTotals } from "./money";

export interface SerializedWallet {
  id: string;
  alias: string;
  type: WalletType;
  statementDay: number | null;
  dueDay: number | null;
  initialBalanceSatang: number;
  isActive: boolean;
  createdAt: string;
}

export interface SerializedCategory {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  createdAt: string;
}

export interface SerializedTransaction {
  id: string;
  type: TransactionType;
  amountSatang: number;
  walletId: string;
  toWalletId: string | null;
  categoryId: string | null;
  merchant: string;
  note: string | null;
  transactionDate: string;
  source: TransactionSource;
  isReconciled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerOverview {
  month: string;
  referenceDateIso: string;
  wallets: SerializedWallet[];
  categories: SerializedCategory[];
  transactions: SerializedTransaction[];
  monthlyTotals: MonthlyLedgerTotals;
  walletBalances: Record<string, number>;
  creditCardSummaries: CreditCardCycleSummary[];
}
