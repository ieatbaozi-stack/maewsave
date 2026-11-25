import { and, desc, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  categories,
  transactions,
  wallets,
  type Transaction,
} from "@/db/finance-schema";
import {
  calculateCreditCardSummary,
  getBangkokTodayIso,
  getCreditCardBillingCycleWindow,
  getMonthRange,
  type CreditCardCycleSummary,
} from "@/domain/billing-cycle";
import type {
  LedgerOverview,
  SerializedTransaction,
} from "@/domain/ledger-types";
import type {
  LedgerQueryInput,
  TransactionPayloadInput,
} from "@/lib/validation/finance";
import { listCategories } from "./categories";
import {
  extractPgErrorCode,
  FinanceServiceError,
  listWallets,
} from "./wallets";

export type { LedgerOverview, SerializedTransaction };

function parseBigIntSumToSafeNumber(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) {
    return 0;
  }
  const big = typeof raw === "number" ? BigInt(Math.trunc(raw)) : BigInt(raw);
  const num = Number(big);
  if (!Number.isSafeInteger(num)) {
    throw new RangeError("Aggregated satang total exceeds safe integer bounds");
  }
  return num;
}

export function serializeTransaction(row: Transaction): SerializedTransaction {
  return {
    id: row.id,
    type: row.type,
    amountSatang: row.amountSatang,
    walletId: row.walletId,
    toWalletId: row.toWalletId,
    categoryId: row.categoryId,
    merchant: row.merchant,
    note: row.note,
    transactionDate: row.transactionDate,
    source: row.source,
    isReconciled: row.isReconciled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertUserOwnsWallet(
  db: Database,
  userId: string,
  walletId: string,
  allowInactiveId?: string | null,
): Promise<void> {
  const rows = await db
    .select({ id: wallets.id, isActive: wallets.isActive })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .limit(1);

  const found = rows[0];
  if (!found) {
    throw new FinanceServiceError("NOT_FOUND", "Wallet not found", 404);
  }
  if (!found.isActive && found.id !== allowInactiveId) {
    throw new FinanceServiceError(
      "VALIDATION_ERROR",
      "Cannot use an archived wallet",
      400,
    );
  }
}

async function assertUserOwnsCategoryForType(
  db: Database,
  userId: string,
  categoryId: string,
  expectedType: "INCOME" | "EXPENSE",
): Promise<void> {
  const rows = await db
    .select({ id: categories.id, type: categories.type })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);

  const found = rows[0];
  if (!found) {
    throw new FinanceServiceError("NOT_FOUND", "Category not found", 404);
  }
  if (found.type !== expectedType) {
    throw new FinanceServiceError(
      "VALIDATION_ERROR",
      "Category type does not match transaction type",
      400,
    );
  }
}

export async function listTransactions(
  db: Database,
  userId: string,
  query: Partial<LedgerQueryInput> = {},
): Promise<SerializedTransaction[]> {
  const conditions = [eq(transactions.userId, userId)];

  if (query.month) {
    const range = getMonthRange(query.month);
    if (!range) {
      throw new FinanceServiceError("VALIDATION_ERROR", "Invalid month format", 400);
    }
    conditions.push(gte(transactions.transactionDate, range.startDate));
    conditions.push(lte(transactions.transactionDate, range.endDate));
  }

  if (query.type) {
    conditions.push(eq(transactions.type, query.type));
  }

  if (query.walletId) {
    const walletFilter = or(
      eq(transactions.walletId, query.walletId),
      eq(transactions.toWalletId, query.walletId),
    );
    if (walletFilter) {
      conditions.push(walletFilter);
    }
  }

  const limit = query.limit ?? 100;
  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .limit(limit);

  return rows.map(serializeTransaction);
}

export async function getLedgerOverview(
  db: Database,
  userId: string,
  options: { month?: string; referenceDateIso?: string } = {},
): Promise<LedgerOverview> {
  const referenceDateIso = options.referenceDateIso ?? getBangkokTodayIso();
  const month = options.month ?? referenceDateIso.slice(0, 7);
  const monthRange = getMonthRange(month);
  if (!monthRange) {
    throw new FinanceServiceError("VALIDATION_ERROR", "Invalid month format", 400);
  }

  // SQL GROUP BY aggregates avoid loading unbounded historical transactions into serverless RAM
  const [
    userWallets,
    userCategories,
    monthTransactions,
    monthAggRows,
    walletDirectAggRows,
    walletIncomingTransferAggRows,
  ] = await Promise.all([
    listWallets(db, userId, { includeInactive: true }),
    listCategories(db, userId),
    listTransactions(db, userId, { month, limit: 500 }),
    db
      .select({
        type: transactions.type,
        total: sql<string>`COALESCE(SUM(${transactions.amountSatang}), 0)::text`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.transactionDate, monthRange.startDate),
          lte(transactions.transactionDate, monthRange.endDate),
        ),
      )
      .groupBy(transactions.type),
    db
      .select({
        walletId: transactions.walletId,
        type: transactions.type,
        total: sql<string>`COALESCE(SUM(${transactions.amountSatang}), 0)::text`,
      })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .groupBy(transactions.walletId, transactions.type),
    db
      .select({
        toWalletId: transactions.toWalletId,
        total: sql<string>`COALESCE(SUM(${transactions.amountSatang}), 0)::text`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "TRANSFER"),
          isNotNull(transactions.toWalletId),
        ),
      )
      .groupBy(transactions.toWalletId),
  ]);

  let incomeSatang = 0;
  let expenseSatang = 0;
  let transferSatang = 0;
  for (const row of monthAggRows) {
    const amount = parseBigIntSumToSafeNumber(row.total);
    if (row.type === "INCOME") {
      incomeSatang += amount;
    } else if (row.type === "EXPENSE") {
      expenseSatang += amount;
    } else if (row.type === "TRANSFER") {
      transferSatang += amount;
    }
  }

  const walletBalancesBig = new Map<string, bigint>();
  const walletTypeMap = new Map<string, string>();
  for (const wallet of userWallets) {
    walletBalancesBig.set(wallet.id, BigInt(wallet.initialBalanceSatang));
    walletTypeMap.set(wallet.id, wallet.type);
  }

  for (const row of walletDirectAggRows) {
    const walletType = walletTypeMap.get(row.walletId);
    if (!walletType) {
      continue;
    }
    const totalBig = BigInt(row.total);
    const current = walletBalancesBig.get(row.walletId) ?? 0n;
    if (walletType === "CREDIT_CARD") {
      if (row.type === "EXPENSE" || row.type === "TRANSFER") {
        walletBalancesBig.set(row.walletId, current + totalBig);
      } else if (row.type === "INCOME") {
        walletBalancesBig.set(row.walletId, current - totalBig);
      }
    } else {
      if (row.type === "INCOME") {
        walletBalancesBig.set(row.walletId, current + totalBig);
      } else if (row.type === "EXPENSE" || row.type === "TRANSFER") {
        walletBalancesBig.set(row.walletId, current - totalBig);
      }
    }
  }

  for (const row of walletIncomingTransferAggRows) {
    if (!row.toWalletId) {
      continue;
    }
    const walletType = walletTypeMap.get(row.toWalletId);
    if (!walletType) {
      continue;
    }
    const totalBig = BigInt(row.total);
    const current = walletBalancesBig.get(row.toWalletId) ?? 0n;
    if (walletType === "CREDIT_CARD") {
      walletBalancesBig.set(row.toWalletId, current - totalBig);
    } else {
      walletBalancesBig.set(row.toWalletId, current + totalBig);
    }
  }

  const walletBalances: Record<string, number> = {};
  for (const [walletId, balBig] of walletBalancesBig.entries()) {
    const num = Number(balBig);
    if (!Number.isSafeInteger(num)) {
      throw new RangeError("Wallet balance exceeds safe integer bounds");
    }
    walletBalances[walletId] = num;
  }

  // Query bounded billing-cycle window only for active credit cards (max ~62 days)
  const activeCreditCards = userWallets.filter(
    (wallet): wallet is typeof wallet & { type: "CREDIT_CARD" } =>
      wallet.type === "CREDIT_CARD" && wallet.isActive,
  );

  const creditCardSummaries: CreditCardCycleSummary[] = [];
  if (activeCreditCards.length > 0) {
    const cardWindows = activeCreditCards.map((card) => ({
      card,
      window: getCreditCardBillingCycleWindow(
        card.statementDay,
        card.dueDay,
        referenceDateIso,
      ),
    }));

    let minStart = cardWindows[0]?.window.startDate ?? referenceDateIso;
    let maxEnd = cardWindows[0]?.window.endDate ?? referenceDateIso;
    for (const item of cardWindows) {
      if (item.window.startDate < minStart) {
        minStart = item.window.startDate;
      }
      if (item.window.endDate > maxEnd) {
        maxEnd = item.window.endDate;
      }
    }

    const cardIds = activeCreditCards.map((c) => c.id);
    const cardFilter = or(
      inArray(transactions.walletId, cardIds),
      inArray(transactions.toWalletId, cardIds),
    );

    const cycleTxRows = await db
      .select({
        type: transactions.type,
        amountSatang: transactions.amountSatang,
        walletId: transactions.walletId,
        toWalletId: transactions.toWalletId,
        transactionDate: transactions.transactionDate,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.transactionDate, minStart),
          lte(transactions.transactionDate, maxEnd),
          ...(cardFilter ? [cardFilter] : []),
        ),
      );

    for (const { card } of cardWindows) {
      creditCardSummaries.push(
        calculateCreditCardSummary(
          {
            id: card.id,
            alias: card.alias,
            type: "CREDIT_CARD",
            statementDay: card.statementDay,
            dueDay: card.dueDay,
            initialBalanceSatang: card.initialBalanceSatang,
          },
          cycleTxRows,
          referenceDateIso,
          walletBalances[card.id] ?? card.initialBalanceSatang,
        ),
      );
    }
  }

  return {
    month,
    referenceDateIso,
    wallets: userWallets,
    categories: userCategories,
    transactions: monthTransactions,
    monthlyTotals: {
      incomeSatang,
      expenseSatang,
      transferSatang,
      netCashFlowSatang: incomeSatang - expenseSatang,
    },
    walletBalances,
    creditCardSummaries,
  };
}

export async function createTransaction(
  db: Database,
  userId: string,
  input: TransactionPayloadInput,
): Promise<SerializedTransaction> {
  await assertUserOwnsWallet(db, userId, input.walletId);

  let toWalletId: string | null = null;
  let categoryId: string | null = null;

  if (input.type === "TRANSFER") {
    if (!input.toWalletId || input.toWalletId === input.walletId) {
      throw new FinanceServiceError(
        "VALIDATION_ERROR",
        "Transfer requires a distinct destination wallet",
        400,
      );
    }
    await assertUserOwnsWallet(db, userId, input.toWalletId);
    toWalletId = input.toWalletId;
    categoryId = null;
  } else {
    if (input.categoryId) {
      await assertUserOwnsCategoryForType(db, userId, input.categoryId, input.type);
      categoryId = input.categoryId;
    }
  }

  try {
    const rows = await db
      .insert(transactions)
      .values({
        userId,
        type: input.type,
        amountSatang: input.amountSatang,
        walletId: input.walletId,
        toWalletId,
        categoryId,
        merchant: input.merchant,
        note: input.note ?? null,
        transactionDate: input.transactionDate,
        source: "MANUAL",
        isReconciled: false,
      })
      .returning();

    const created = rows[0];
    if (!created) {
      throw new Error("Failed to insert transaction");
    }
    return serializeTransaction(created);
  } catch (err) {
    if (extractPgErrorCode(err) === "23503") {
      throw new FinanceServiceError(
        "NOT_FOUND",
        "Referenced wallet or category not found",
        404,
      );
    }
    throw err;
  }
}

export async function updateTransaction(
  db: Database,
  userId: string,
  transactionId: string,
  input: TransactionPayloadInput,
): Promise<SerializedTransaction> {
  const existingRows = await db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
    )
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    throw new FinanceServiceError("NOT_FOUND", "Transaction not found", 404);
  }

  await assertUserOwnsWallet(db, userId, input.walletId, existing.walletId);

  let toWalletId: string | null = null;
  let categoryId: string | null = null;

  if (input.type === "TRANSFER") {
    if (!input.toWalletId || input.toWalletId === input.walletId) {
      throw new FinanceServiceError(
        "VALIDATION_ERROR",
        "Transfer requires a distinct destination wallet",
        400,
      );
    }
    await assertUserOwnsWallet(db, userId, input.toWalletId, existing.toWalletId);
    toWalletId = input.toWalletId;
    categoryId = null;
  } else {
    if (input.categoryId) {
      await assertUserOwnsCategoryForType(db, userId, input.categoryId, input.type);
      categoryId = input.categoryId;
    }
  }

  try {
    const updatedRows = await db
      .update(transactions)
      .set({
        type: input.type,
        amountSatang: input.amountSatang,
        walletId: input.walletId,
        toWalletId,
        categoryId,
        merchant: input.merchant,
        note: input.note ?? null,
        transactionDate: input.transactionDate,
        updatedAt: new Date(),
      })
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
      )
      .returning();

    const updated = updatedRows[0];
    if (!updated) {
      throw new FinanceServiceError("NOT_FOUND", "Transaction not found", 404);
    }
    return serializeTransaction(updated);
  } catch (err) {
    if (extractPgErrorCode(err) === "23503") {
      throw new FinanceServiceError(
        "NOT_FOUND",
        "Referenced wallet or category not found",
        404,
      );
    }
    throw err;
  }
}

export async function deleteTransaction(
  db: Database,
  userId: string,
  transactionId: string,
): Promise<{ id: string }> {
  const deletedRows = await db
    .delete(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
    )
    .returning({ id: transactions.id });

  const deleted = deletedRows[0];
  if (!deleted) {
    throw new FinanceServiceError("NOT_FOUND", "Transaction not found", 404);
  }
  return deleted;
}
