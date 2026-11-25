import { describe, expect, it } from "vitest";
import {
  createCategorySchema,
  createWalletSchema,
  ledgerQuerySchema,
  transactionPayloadSchema,
  updateCategorySchema,
  updateWalletSchema,
  walletQuerySchema,
} from "../finance";

const WALLET_A = "11111111-1111-4111-8111-111111111111";
const WALLET_B = "22222222-2222-4222-8222-222222222222";
const CAT_A = "33333333-3333-4333-8333-333333333333";

describe("src/lib/validation/finance", () => {
  it("strips statementDay and dueDay for non-CREDIT_CARD wallets", () => {
    const parsed = createWalletSchema.parse({
      alias: "Bank A",
      type: "BANK_CASH",
      statementDay: 15,
      dueDay: 5,
      initialBalanceSatang: 50_000,
    });

    expect(parsed.statementDay).toBeNull();
    expect(parsed.dueDay).toBeNull();
    expect(parsed.initialBalanceSatang).toBe(50_000);
  });

  it("keeps statementDay and dueDay for CREDIT_CARD wallets and rejects out-of-range days", () => {
    const valid = createWalletSchema.parse({
      alias: "Card A",
      type: "CREDIT_CARD",
      statementDay: 25,
      dueDay: 15,
    });
    expect(valid.statementDay).toBe(25);
    expect(valid.dueDay).toBe(15);

    expect(
      createWalletSchema.safeParse({
        alias: "Card Bad",
        type: "CREDIT_CARD",
        statementDay: 32,
      }).success,
    ).toBe(false);
  });

  it("rejects empty update payloads and invalid category icons", () => {
    expect(updateWalletSchema.safeParse({}).success).toBe(false);
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
    expect(
      createCategorySchema.safeParse({
        name: "Food",
        type: "EXPENSE",
        icon: "evil-xss",
      }).success,
    ).toBe(false);
  });

  it("enforces transfer invariants and rejects float amounts, impossible dates, and year 0000", () => {
    expect(
      transactionPayloadSchema.safeParse({
        type: "EXPENSE",
        amountSatang: 6550,
        walletId: WALLET_A,
        categoryId: CAT_A,
        merchant: "Coffee Shop",
        transactionDate: "2026-11-25",
      }).success,
    ).toBe(true);

    expect(
      transactionPayloadSchema.safeParse({
        type: "EXPENSE",
        amountSatang: 65.5,
        walletId: WALLET_A,
        merchant: "Coffee Shop",
        transactionDate: "2026-11-25",
      }).success,
    ).toBe(false);

    expect(
      transactionPayloadSchema.safeParse({
        type: "TRANSFER",
        amountSatang: 10_000,
        walletId: WALLET_A,
        toWalletId: WALLET_A,
        merchant: "Self Transfer",
        transactionDate: "2026-11-25",
      }).success,
    ).toBe(false);

    expect(
      transactionPayloadSchema.safeParse({
        type: "TRANSFER",
        amountSatang: 10_000,
        walletId: WALLET_A,
        toWalletId: WALLET_B,
        categoryId: CAT_A,
        merchant: "Pay Card A",
        transactionDate: "2026-11-25",
      }).success,
    ).toBe(false);

    expect(
      transactionPayloadSchema.safeParse({
        type: "EXPENSE",
        amountSatang: 10_000,
        walletId: WALLET_A,
        toWalletId: WALLET_B,
        merchant: "Shop",
        transactionDate: "2026-11-25",
      }).success,
    ).toBe(false);

    expect(
      transactionPayloadSchema.safeParse({
        type: "EXPENSE",
        amountSatang: 10_000,
        walletId: WALLET_A,
        merchant: "Shop",
        transactionDate: "2026-02-29",
      }).success,
    ).toBe(false);

    expect(
      transactionPayloadSchema.safeParse({
        type: "EXPENSE",
        amountSatang: 10_000,
        walletId: WALLET_A,
        merchant: "Shop",
        transactionDate: "0000-01-01",
      }).success,
    ).toBe(false);

    expect(
      transactionPayloadSchema.safeParse({
        type: "TRANSFER",
        amountSatang: 100_000,
        walletId: WALLET_A,
        toWalletId: WALLET_B,
        merchant: "Pay Card A",
        transactionDate: "2026-11-25",
      }).success,
    ).toBe(true);
  });

  it("validates ledger and wallet query parameters strictly", () => {
    expect(ledgerQuerySchema.safeParse({ month: "2026-11", overview: "1" }).success).toBe(true);
    expect(ledgerQuerySchema.safeParse({ month: "0000-01" }).success).toBe(false);
    expect(ledgerQuerySchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(ledgerQuerySchema.safeParse({ overview: "yes" }).success).toBe(false);
    expect(ledgerQuerySchema.safeParse({ limit: "999" }).success).toBe(false);

    expect(walletQuerySchema.safeParse({ includeInactive: "false" }).success).toBe(true);
    expect(walletQuerySchema.safeParse({ includeInactive: "invalid" }).success).toBe(false);
  });
});
