import { and, asc, count, desc, eq, or } from "drizzle-orm";
import type { Database } from "@/db";
import { recurringRules, transactions, wallets, type Wallet } from "@/db/finance-schema";
import type { SerializedWallet } from "@/domain/ledger-types";
import type { CreateWalletInput, UpdateWalletInput } from "@/lib/validation/finance";

export type { SerializedWallet };

export const MAX_WALLETS_PER_USER = 50;

export type FinanceErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "IN_USE"
  | "CONFLICT"
  | "LIMIT_REACHED";

export class FinanceServiceError extends Error {
  readonly code: FinanceErrorCode;
  readonly status: number;

  constructor(code: FinanceErrorCode, message: string, status: number) {
    super(message);
    this.name = "FinanceServiceError";
    this.code = code;
    this.status = status;
  }
}

export function extractPgErrorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const record = current as { code?: unknown; cause?: unknown };
    if (typeof record.code === "string") {
      return record.code;
    }
    current = record.cause;
  }
  return null;
}

export function serializeWallet(row: Wallet): SerializedWallet {
  return {
    id: row.id,
    alias: row.alias,
    type: row.type,
    statementDay: row.statementDay,
    dueDay: row.dueDay,
    initialBalanceSatang: row.initialBalanceSatang,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWallets(
  db: Database,
  userId: string,
  options: { includeInactive?: boolean } = {},
): Promise<SerializedWallet[]> {
  const { includeInactive = true } = options;
  const condition = includeInactive
    ? eq(wallets.userId, userId)
    : and(eq(wallets.userId, userId), eq(wallets.isActive, true));

  const rows = await db
    .select()
    .from(wallets)
    .where(condition)
    .orderBy(desc(wallets.isActive), asc(wallets.createdAt))
    .limit(MAX_WALLETS_PER_USER);

  return rows.map(serializeWallet);
}

export async function createWallet(
  db: Database,
  userId: string,
  input: CreateWalletInput,
): Promise<SerializedWallet> {
  const countRows = await db
    .select({ total: count() })
    .from(wallets)
    .where(eq(wallets.userId, userId));

  const currentCount = Number(countRows[0]?.total ?? 0);
  if (currentCount >= MAX_WALLETS_PER_USER) {
    throw new FinanceServiceError(
      "LIMIT_REACHED",
      "Maximum wallet limit reached",
      409,
    );
  }

  const isCreditCard = input.type === "CREDIT_CARD";
  const rows = await db
    .insert(wallets)
    .values({
      userId,
      alias: input.alias,
      type: input.type,
      statementDay: isCreditCard ? input.statementDay : null,
      dueDay: isCreditCard ? input.dueDay : null,
      initialBalanceSatang: input.initialBalanceSatang,
      isActive: true,
    })
    .returning();

  const created = rows[0];
  if (!created) {
    throw new Error("Failed to insert wallet");
  }
  return serializeWallet(created);
}

export async function updateWallet(
  db: Database,
  userId: string,
  walletId: string,
  input: UpdateWalletInput,
): Promise<SerializedWallet> {
  const existingRows = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    throw new FinanceServiceError("NOT_FOUND", "Wallet not found", 404);
  }

  const nextType = input.type ?? existing.type;
  const isCreditCard = nextType === "CREDIT_CARD";
  const nextStatementDay = isCreditCard
    ? input.statementDay !== undefined
      ? input.statementDay
      : existing.statementDay
    : null;
  const nextDueDay = isCreditCard
    ? input.dueDay !== undefined
      ? input.dueDay
      : existing.dueDay
    : null;

  const updatedRows = await db
    .update(wallets)
    .set({
      alias: input.alias ?? existing.alias,
      type: nextType,
      statementDay: nextStatementDay,
      dueDay: nextDueDay,
      initialBalanceSatang:
        input.initialBalanceSatang ?? existing.initialBalanceSatang,
      isActive: input.isActive ?? existing.isActive,
    })
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .returning();

  const updated = updatedRows[0];
  if (!updated) {
    throw new FinanceServiceError("NOT_FOUND", "Wallet not found", 404);
  }
  return serializeWallet(updated);
}

export async function deleteWallet(
  db: Database,
  userId: string,
  walletId: string,
): Promise<{ id: string }> {
  const existingRows = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .limit(1);

  if (!existingRows[0]) {
    throw new FinanceServiceError("NOT_FOUND", "Wallet not found", 404);
  }

  const [usedInTx, usedInRules] = await Promise.all([
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          or(
            eq(transactions.walletId, walletId),
            eq(transactions.toWalletId, walletId),
          ),
        ),
      )
      .limit(1),
    db
      .select({ id: recurringRules.id })
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.userId, userId),
          eq(recurringRules.walletId, walletId),
        ),
      )
      .limit(1),
  ]);

  if (usedInTx[0] || usedInRules[0]) {
    throw new FinanceServiceError(
      "IN_USE",
      "Wallet has existing transactions or recurring rules; archive it instead",
      409,
    );
  }

  try {
    const deletedRows = await db
      .delete(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .returning({ id: wallets.id });

    const deleted = deletedRows[0];
    if (!deleted) {
      throw new FinanceServiceError("NOT_FOUND", "Wallet not found", 404);
    }
    return deleted;
  } catch (err) {
    if (extractPgErrorCode(err) === "23503") {
      throw new FinanceServiceError(
        "IN_USE",
        "Wallet has existing transactions or recurring rules; archive it instead",
        409,
      );
    }
    throw err;
  }
}
