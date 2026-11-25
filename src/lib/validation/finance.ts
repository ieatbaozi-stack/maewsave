import { z } from "zod";
import {
  CATEGORY_TYPES,
  TRANSACTION_TYPES,
  WALLET_TYPES,
} from "@/db/finance-schema";
import {
  getMonthRange,
  isValidIsoDate,
} from "@/domain/billing-cycle";
import { MAX_SAFE_SATANG } from "@/domain/money";

export const CATEGORY_ICON_KEYS = [
  "utensils",
  "coffee",
  "car",
  "shopping-bag",
  "home",
  "heart-pulse",
  "tv",
  "plane",
  "zap",
  "wallet",
  "briefcase",
  "gift",
  "tag",
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export const uuidParamSchema = z.string().uuid();

const billingDaySchema = z.number().int().min(1).max(31).nullable();

export const walletQuerySchema = z.object({
  includeInactive: z.enum(["true", "false"]).optional(),
});

export const createWalletSchema = z
  .object({
    alias: z.string().trim().min(1).max(50),
    type: z.enum(WALLET_TYPES),
    statementDay: billingDaySchema.optional().default(null),
    dueDay: billingDaySchema.optional().default(null),
    initialBalanceSatang: z
      .number()
      .int()
      .min(-MAX_SAFE_SATANG)
      .max(MAX_SAFE_SATANG)
      .optional()
      .default(0),
  })
  .transform((data) => ({
    ...data,
    statementDay: data.type === "CREDIT_CARD" ? data.statementDay : null,
    dueDay: data.type === "CREDIT_CARD" ? data.dueDay : null,
  }));

export const updateWalletSchema = z
  .object({
    alias: z.string().trim().min(1).max(50).optional(),
    type: z.enum(WALLET_TYPES).optional(),
    statementDay: billingDaySchema.optional(),
    dueDay: billingDaySchema.optional(),
    initialBalanceSatang: z
      .number()
      .int()
      .min(-MAX_SAFE_SATANG)
      .max(MAX_SAFE_SATANG)
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  type: z.enum(CATEGORY_TYPES),
  icon: z.enum(CATEGORY_ICON_KEYS).nullable().optional().default("tag"),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    icon: z.enum(CATEGORY_ICON_KEYS).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const seedCategoriesSchema = z.object({
  action: z.literal("seed"),
  locale: z.enum(["th", "en"]),
});

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((val) => isValidIsoDate(val), "Invalid calendar date");

export const transactionPayloadSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    amountSatang: z.number().int().min(1).max(MAX_SAFE_SATANG),
    walletId: z.string().uuid(),
    toWalletId: z.string().uuid().nullable().optional().default(null),
    categoryId: z.string().uuid().nullable().optional().default(null),
    merchant: z.string().trim().min(1).max(120),
    note: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .transform((val) => (val && val.length > 0 ? val : null)),
    transactionDate: isoDateSchema,
  })
  .superRefine((data, ctx) => {
    if (data.type === "TRANSFER") {
      if (!data.toWalletId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toWalletId"],
          message: "Destination wallet is required for transfers",
        });
      } else if (data.toWalletId === data.walletId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toWalletId"],
          message: "Source and destination wallets must be different",
        });
      }
      if (data.categoryId !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categoryId"],
          message: "Transfers cannot have a category",
        });
      }
    } else if (data.toWalletId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toWalletId"],
        message: "Destination wallet is only allowed for transfers",
      });
    }
  });

export const ledgerQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM")
    .refine((val) => getMonthRange(val) !== null, "Month year out of allowed range")
    .optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  walletId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  overview: z.enum(["0", "1"]).optional(),
});

export type WalletQueryInput = z.infer<typeof walletQuerySchema>;
export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type TransactionPayloadInput = z.infer<typeof transactionPayloadSchema>;
export type LedgerQueryInput = z.infer<typeof ledgerQuerySchema>;
