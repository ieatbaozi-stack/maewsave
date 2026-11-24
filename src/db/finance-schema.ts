import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const WALLET_TYPES = ["BANK_CASH", "CREDIT_CARD", "EWALLET"] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export const CATEGORY_TYPES = ["INCOME", "EXPENSE"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_SOURCES = [
  "MANUAL",
  "AI_TEXT",
  "AI_SLIP",
  "RECURRING",
  "STATEMENT",
] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const RECURRING_FREQUENCIES = ["MONTHLY", "YEARLY"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_ACTION_TYPES = ["AUTO_CHARGE", "MANUAL_PAY"] as const;
export type RecurringActionType = (typeof RECURRING_ACTION_TYPES)[number];

// 1. Virtual Wallets (Zero PII)
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alias: varchar("alias", { length: 50 }).notNull(),
    type: varchar("type", { length: 20 }).$type<WalletType>().notNull(),
    statementDay: smallint("statement_day"),
    dueDay: smallint("due_day"),
    initialBalanceSatang: bigint("initial_balance_satang", { mode: "number" })
      .notNull()
      .default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "wallets_statement_day_range",
      sql`${table.statementDay} IS NULL OR (${table.statementDay} >= 1 AND ${table.statementDay} <= 31)`,
    ),
    check(
      "wallets_due_day_range",
      sql`${table.dueDay} IS NULL OR (${table.dueDay} >= 1 AND ${table.dueDay} <= 31)`,
    ),
  ],
);

// 2. Categories
export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  type: varchar("type", { length: 10 }).$type<CategoryType>().notNull(),
  icon: varchar("icon", { length: 30 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 3. Smart Recurring Rules
export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 100 }).notNull(),
    amountSatang: bigint("amount_satang", { mode: "number" }).notNull(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    categoryId: uuid("category_id").references(() => categories.id),
    frequency: varchar("frequency", { length: 10 }).$type<RecurringFrequency>().notNull(),
    billingDay: smallint("billing_day").notNull(),
    billingMonth: smallint("billing_month"),
    actionType: varchar("action_type", { length: 15 })
      .$type<RecurringActionType>()
      .notNull(),
    nextRunDate: date("next_run_date", { mode: "string" }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("recurring_rules_amount_positive", sql`${table.amountSatang} > 0`),
    check(
      "recurring_rules_billing_day_range",
      sql`${table.billingDay} >= 1 AND ${table.billingDay} <= 31`,
    ),
    check(
      "recurring_rules_billing_month_range",
      sql`${table.billingMonth} IS NULL OR (${table.billingMonth} >= 1 AND ${table.billingMonth} <= 12)`,
    ),
    index("recurring_rules_active_next_run_idx").on(table.isActive, table.nextRunDate),
  ],
);

// 4. Transactions (Ledger)
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 15 }).$type<TransactionType>().notNull(),
    amountSatang: bigint("amount_satang", { mode: "number" }).notNull(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    toWalletId: uuid("to_wallet_id").references(() => wallets.id),
    categoryId: uuid("category_id").references(() => categories.id),
    merchant: varchar("merchant", { length: 120 }).notNull(),
    note: text("note"),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    source: varchar("source", { length: 20 })
      .$type<TransactionSource>()
      .notNull()
      .default("MANUAL"),
    isReconciled: boolean("is_reconciled").notNull().default(false),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("transactions_amount_positive", sql`${table.amountSatang} > 0`),
    index("transactions_date_idx").on(table.transactionDate),
    index("transactions_wallet_date_idx").on(table.walletId, table.transactionDate),
  ],
);

// 5. Web Push Subscriptions (iOS PWA)
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type NewRecurringRule = typeof recurringRules.$inferInsert;
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;
