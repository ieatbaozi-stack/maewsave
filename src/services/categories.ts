import { and, asc, count, eq } from "drizzle-orm";
import type { Database } from "@/db";
import {
  categories,
  recurringRules,
  transactions,
  type Category,
  type CategoryType,
} from "@/db/finance-schema";
import type { SerializedCategory } from "@/domain/ledger-types";
import type {
  CategoryIconKey,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/lib/validation/finance";
import { extractPgErrorCode, FinanceServiceError } from "./wallets";

export type { SerializedCategory };

export const MAX_CATEGORIES_PER_USER = 100;

interface StarterCategoryTemplate {
  nameTh: string;
  nameEn: string;
  type: CategoryType;
  icon: CategoryIconKey;
}

const STARTER_CATEGORY_TEMPLATES: readonly StarterCategoryTemplate[] = [
  { nameTh: "อาหารและเครื่องดื่ม", nameEn: "Food & Drink", type: "EXPENSE", icon: "utensils" },
  { nameTh: "กาแฟและของว่าง", nameEn: "Coffee & Snacks", type: "EXPENSE", icon: "coffee" },
  { nameTh: "เดินทาง", nameEn: "Transport", type: "EXPENSE", icon: "car" },
  { nameTh: "ช้อปปิ้ง", nameEn: "Shopping", type: "EXPENSE", icon: "shopping-bag" },
  { nameTh: "ที่พักและสาธารณูปโภค", nameEn: "Housing & Utilities", type: "EXPENSE", icon: "home" },
  { nameTh: "สุขภาพ", nameEn: "Health", type: "EXPENSE", icon: "heart-pulse" },
  { nameTh: "ความบันเทิงและสมาชิก", nameEn: "Subscriptions & Fun", type: "EXPENSE", icon: "tv" },
  { nameTh: "เงินเดือน", nameEn: "Salary", type: "INCOME", icon: "briefcase" },
  { nameTh: "รายได้เสริมและคืนเงิน", nameEn: "Other Income & Cashback", type: "INCOME", icon: "gift" },
] as const;

export function serializeCategory(row: Category): SerializedCategory {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCategories(
  db: Database,
  userId: string,
): Promise<SerializedCategory[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.type), asc(categories.name))
    .limit(MAX_CATEGORIES_PER_USER);

  return rows.map(serializeCategory);
}

export async function createCategory(
  db: Database,
  userId: string,
  input: CreateCategoryInput,
): Promise<SerializedCategory> {
  const countRows = await db
    .select({ total: count() })
    .from(categories)
    .where(eq(categories.userId, userId));

  if (Number(countRows[0]?.total ?? 0) >= MAX_CATEGORIES_PER_USER) {
    throw new FinanceServiceError(
      "LIMIT_REACHED",
      "Maximum category limit reached",
      409,
    );
  }

  try {
    const rows = await db
      .insert(categories)
      .values({
        userId,
        name: input.name,
        type: input.type,
        icon: input.icon ?? "tag",
      })
      .returning();

    const created = rows[0];
    if (!created) {
      throw new Error("Failed to insert category");
    }
    return serializeCategory(created);
  } catch (err) {
    if (extractPgErrorCode(err) === "23505") {
      throw new FinanceServiceError(
        "CONFLICT",
        "A category with this name already exists",
        409,
      );
    }
    throw err;
  }
}

export async function seedStarterCategories(
  db: Database,
  userId: string,
  locale: "th" | "en",
): Promise<SerializedCategory[]> {
  const existing = await listCategories(db, userId);
  const remainingSlots = MAX_CATEGORIES_PER_USER - existing.length;
  if (remainingSlots <= 0) {
    return existing;
  }

  const existingKeys = new Set(
    existing.map((c) => `${c.type}:${c.name.trim().toLowerCase()}`),
  );

  const toInsert = STARTER_CATEGORY_TEMPLATES.map((tpl) => ({
    userId,
    name: locale === "th" ? tpl.nameTh : tpl.nameEn,
    type: tpl.type,
    icon: tpl.icon,
  }))
    .filter(
      (candidate) =>
        !existingKeys.has(`${candidate.type}:${candidate.name.trim().toLowerCase()}`),
    )
    .slice(0, remainingSlots);

  if (toInsert.length > 0) {
    // Unique index (user_id, type, lower(btrim(name))) + ON CONFLICT DO NOTHING makes seeding race-safe
    await db.insert(categories).values(toInsert).onConflictDoNothing();
  }

  return listCategories(db, userId);
}

export async function updateCategory(
  db: Database,
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<SerializedCategory> {
  const existingRows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    throw new FinanceServiceError("NOT_FOUND", "Category not found", 404);
  }

  try {
    const updatedRows = await db
      .update(categories)
      .set({
        name: input.name ?? existing.name,
        icon: input.icon !== undefined ? input.icon : existing.icon,
      })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .returning();

    const updated = updatedRows[0];
    if (!updated) {
      throw new FinanceServiceError("NOT_FOUND", "Category not found", 404);
    }
    return serializeCategory(updated);
  } catch (err) {
    if (extractPgErrorCode(err) === "23505") {
      throw new FinanceServiceError(
        "CONFLICT",
        "A category with this name already exists",
        409,
      );
    }
    throw err;
  }
}

export async function deleteCategory(
  db: Database,
  userId: string,
  categoryId: string,
): Promise<{ id: string }> {
  const existingRows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);

  if (!existingRows[0]) {
    throw new FinanceServiceError("NOT_FOUND", "Category not found", 404);
  }

  // Execute reference cleanup + category deletion atomically in a single Neon HTTP batch transaction
  const now = new Date();
  let deletedRows: { id: string }[];
  try {
    [, , deletedRows] = await db.batch([
      db
        .update(transactions)
        .set({ categoryId: null, updatedAt: now })
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.categoryId, categoryId),
          ),
        ),
      db
        .update(recurringRules)
        .set({ categoryId: null, updatedAt: now })
        .where(
          and(
            eq(recurringRules.userId, userId),
            eq(recurringRules.categoryId, categoryId),
          ),
        ),
      db
        .delete(categories)
        .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
        .returning({ id: categories.id }),
    ]);
  } catch (err) {
    if (extractPgErrorCode(err) === "23503") {
      throw new FinanceServiceError(
        "CONFLICT",
        "Category was concurrently referenced; retry deletion",
        409,
      );
    }
    throw err;
  }

  const deleted = deletedRows[0];
  if (!deleted) {
    throw new FinanceServiceError("NOT_FOUND", "Category not found", 404);
  }
  return deleted;
}
