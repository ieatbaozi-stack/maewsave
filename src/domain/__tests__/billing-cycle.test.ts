import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  calculateCreditCardSummary,
  calculateWalletBalanceSatang,
  clampDayOfMonth,
  formatMonthYearLabel,
  formatShortDayMonth,
  formatShortTransactionDate,
  getBangkokTodayIso,
  getCurrentBillingCycle,
  getDaysInMonth,
  getMonthRange,
  isValidIsoDate,
  shiftYearMonth,
} from "../billing-cycle";

describe("src/domain/billing-cycle", () => {
  describe("calendar date helpers", () => {
    it("computes days in month including leap years and rejects invalid months", () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2026, 2)).toBe(28);
      expect(getDaysInMonth(2100, 2)).toBe(28);
      expect(getDaysInMonth(2000, 2)).toBe(29);
      expect(getDaysInMonth(2026, 4)).toBe(30);
      expect(getDaysInMonth(2026, 12)).toBe(31);
      expect(() => getDaysInMonth(2026, 0)).toThrow(RangeError);
      expect(() => getDaysInMonth(2026, 13)).toThrow(RangeError);
    });

    it("clamps day of month safely", () => {
      expect(clampDayOfMonth(2026, 2, 31)).toBe(28);
      expect(clampDayOfMonth(2024, 2, 31)).toBe(29);
      expect(clampDayOfMonth(2026, 4, 31)).toBe(30);
      expect(clampDayOfMonth(2026, 5, 15)).toBe(15);
    });

    it("validates calendar ISO dates and enforces 1900-2100 year bounds", () => {
      expect(isValidIsoDate("2026-11-25")).toBe(true);
      expect(isValidIsoDate("2024-02-29")).toBe(true);
      expect(isValidIsoDate("1900-01-01")).toBe(true);
      expect(isValidIsoDate("2100-12-31")).toBe(true);
      expect(isValidIsoDate("0000-01-01")).toBe(false);
      expect(isValidIsoDate("1899-12-31")).toBe(false);
      expect(isValidIsoDate("2101-01-01")).toBe(false);
      expect(isValidIsoDate("2026-02-29")).toBe(false);
      expect(isValidIsoDate("2026-04-31")).toBe(false);
      expect(isValidIsoDate("2026-13-01")).toBe(false);
      expect(isValidIsoDate("25-11-2026")).toBe(false);
    });

    it("adds days across month and year boundaries and throws on invalid ISO", () => {
      expect(addDaysIso("2026-01-31", 1)).toBe("2026-02-01");
      expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
      expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29");
      expect(addDaysIso("2025-12-31", 1)).toBe("2026-01-01");
      expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
      expect(() => addDaysIso("0000-01-01", 1)).toThrow(RangeError);
    });

    it("computes month ranges and shifts YYYY-MM cleanly within valid year bounds", () => {
      expect(getMonthRange("2026-02")).toEqual({
        startDate: "2026-02-01",
        endDate: "2026-02-28",
      });
      expect(getMonthRange("2024-02")).toEqual({
        startDate: "2024-02-01",
        endDate: "2024-02-29",
      });
      expect(getMonthRange("0000-01")).toBeNull();
      expect(getMonthRange("2026-13")).toBeNull();
      expect(getMonthRange("bad")).toBeNull();
      expect(shiftYearMonth("2026-01", -1)).toBe("2025-12");
      expect(shiftYearMonth("2026-12", 1)).toBe("2027-01");
      expect(shiftYearMonth("1900-01", -1)).toBeNull();
      expect(shiftYearMonth("2100-12", 1)).toBeNull();
      expect(shiftYearMonth("0000-01", -1)).toBeNull();
      expect(shiftYearMonth("invalid", 1)).toBeNull();
    });

    it("formats dates in Asia/Bangkok and deterministic TH/EN Gregorian strings", () => {
      expect(getBangkokTodayIso(new Date("2026-11-25T18:30:00Z"))).toBe("2026-11-26");
      expect(formatShortTransactionDate("2026-11-24", "th")).toBe("24 พ.ย. 2026");
      expect(formatShortTransactionDate("2026-11-24", "en")).toBe("24 Nov 2026");
      expect(formatShortTransactionDate("invalid", "en")).toBe("invalid");
      expect(formatShortDayMonth("2026-11-24", "th")).toBe("24 พ.ย.");
      expect(formatShortDayMonth("2026-11-24", "en")).toBe("24 Nov");
      expect(formatShortDayMonth("invalid", "en")).toBe("invalid");
      expect(formatMonthYearLabel("2026-11", "th")).toBe("พ.ย. 2026");
      expect(formatMonthYearLabel("2026-11", "en")).toBe("Nov 2026");
      expect(formatMonthYearLabel("bad", "en")).toBe("bad");
    });
  });

  describe("getCurrentBillingCycle", () => {
    it("computes cycle when reference date is on or before statementDay", () => {
      expect(getCurrentBillingCycle(15, "2026-11-10", 5)).toEqual({
        startDate: "2026-10-16",
        endDate: "2026-11-15",
        statementDate: "2026-11-15",
        dueDate: "2026-12-05",
      });

      expect(getCurrentBillingCycle(15, "2026-11-15", 25)).toEqual({
        startDate: "2026-10-16",
        endDate: "2026-11-15",
        statementDate: "2026-11-15",
        dueDate: "2026-11-25",
      });

      expect(getCurrentBillingCycle(15, "2026-11-15", null).dueDate).toBeNull();
    });

    it("advances dueDate to next month in short months when statementDay is clamped (Feb regressions)", () => {
      // statementDay=30, dueDay=29 on Feb 2026 (clamped close 2026-02-28) -> due next month 2026-03-29
      expect(getCurrentBillingCycle(30, "2026-02-15", 29)).toEqual({
        startDate: "2026-01-31",
        endDate: "2026-02-28",
        statementDate: "2026-02-28",
        dueDate: "2026-03-29",
      });

      // statementDay=31, dueDay=31 on Feb 2026 -> due 2026-03-31 (not 2026-02-28)
      expect(getCurrentBillingCycle(31, "2026-02-15", 31)).toEqual({
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        statementDate: "2026-02-28",
        dueDate: "2026-03-31",
      });

      // statementDay=28, dueDay=30 on Feb 2026 -> clamped same-month 28 == close 28 -> advance to 2026-03-30
      expect(getCurrentBillingCycle(28, "2026-02-15", 30)).toEqual({
        startDate: "2026-01-29",
        endDate: "2026-02-28",
        statementDate: "2026-02-28",
        dueDate: "2026-03-30",
      });

      // Leap year Feb 2024: statementDay=30, dueDay=29 -> due 2024-03-29
      expect(getCurrentBillingCycle(30, "2024-02-20", 29).dueDate).toBe("2024-03-29");
    });

    it("advances to next cycle when reference date is after statementDay", () => {
      expect(getCurrentBillingCycle(15, "2026-11-16", 5)).toEqual({
        startDate: "2026-11-16",
        endDate: "2026-12-15",
        statementDate: "2026-12-15",
        dueDate: "2027-01-05",
      });
    });

    it("handles year wraparound, month-end clamping, statementDay 1, and invalid inputs", () => {
      expect(getCurrentBillingCycle(15, "2026-01-10", 5)).toEqual({
        startDate: "2025-12-16",
        endDate: "2026-01-15",
        statementDate: "2026-01-15",
        dueDate: "2026-02-05",
      });

      expect(getCurrentBillingCycle(31, "2024-02-29", 15)).toEqual({
        startDate: "2024-02-01",
        endDate: "2024-02-29",
        statementDate: "2024-02-29",
        dueDate: "2024-03-15",
      });

      expect(getCurrentBillingCycle(31, "2026-03-01", 15)).toEqual({
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        statementDate: "2026-03-31",
        dueDate: "2026-04-15",
      });

      expect(getCurrentBillingCycle(1, "2026-01-01", 20)).toEqual({
        startDate: "2025-12-02",
        endDate: "2026-01-01",
        statementDate: "2026-01-01",
        dueDate: "2026-01-20",
      });

      expect(() => getCurrentBillingCycle(0, "2026-11-15", 5)).toThrow(RangeError);
      expect(() => getCurrentBillingCycle(32, "2026-11-15", 5)).toThrow(RangeError);
      expect(() => getCurrentBillingCycle(15, "2026-02-29", 5)).toThrow(RangeError);
      expect(() => getCurrentBillingCycle(15, "2026-11-15", 32)).toThrow(RangeError);
    });
  });

  describe("wallet balance and credit card reconciliation math", () => {
    it("prevents double-counting when swiping Card A and paying Card A from Bank A", () => {
      const bankA = {
        id: "bank-a",
        alias: "Bank A",
        type: "BANK_CASH" as const,
        statementDay: null,
        dueDay: null,
        initialBalanceSatang: 1_000_000,
      };
      const cardA = {
        id: "card-a",
        alias: "Card A",
        type: "CREDIT_CARD" as const,
        statementDay: 15,
        dueDay: 5,
        initialBalanceSatang: 0,
      };

      const transactions = [
        {
          type: "EXPENSE" as const,
          amountSatang: 100_000,
          walletId: "card-a",
          toWalletId: null,
          transactionDate: "2026-10-20",
        },
        {
          type: "EXPENSE" as const,
          amountSatang: 25_000,
          walletId: "card-a",
          toWalletId: null,
          transactionDate: "2026-11-18",
        },
        {
          type: "INCOME" as const,
          amountSatang: 5_000,
          walletId: "card-a",
          toWalletId: null,
          transactionDate: "2026-11-20",
        },
        {
          type: "TRANSFER" as const,
          amountSatang: 100_000,
          walletId: "bank-a",
          toWalletId: "card-a",
          transactionDate: "2026-11-25",
        },
      ];

      expect(calculateWalletBalanceSatang(bankA, transactions)).toBe(900_000);

      const summary = calculateCreditCardSummary(cardA, transactions, "2026-11-25");
      expect(summary.cycle).toEqual({
        startDate: "2026-11-16",
        endDate: "2026-12-15",
        statementDate: "2026-12-15",
        dueDate: "2027-01-05",
      });
      expect(summary.currentCycleSpendSatang).toBe(20_000);
      expect(summary.currentCyclePaymentSatang).toBe(100_000);
      expect(summary.outstandingBalanceSatang).toBe(20_000);
    });

    it("falls back to calendar month when statementDay is null and advances Feb dueDay 30 to March", () => {
      const cardNoCycle = {
        id: "card-b",
        alias: "Card B",
        type: "CREDIT_CARD" as const,
        statementDay: null,
        dueDay: 30,
        initialBalanceSatang: 0,
      };

      const summary = calculateCreditCardSummary(
        cardNoCycle,
        [
          {
            type: "EXPENSE",
            amountSatang: 45_000,
            walletId: "card-b",
            toWalletId: null,
            transactionDate: "2026-02-12",
          },
        ],
        "2026-02-15",
      );

      expect(summary.cycle).toEqual({
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        statementDate: "2026-02-28",
        dueDate: "2026-03-30",
      });
      expect(summary.currentCycleSpendSatang).toBe(45_000);
      expect(summary.outstandingBalanceSatang).toBe(45_000);
    });

    it("accepts precomputed outstanding balance from SQL aggregates", () => {
      const cardC = {
        id: "card-c",
        alias: "Card C",
        type: "CREDIT_CARD" as const,
        statementDay: 15,
        dueDay: 5,
        initialBalanceSatang: 0,
      };

      const summary = calculateCreditCardSummary(cardC, [], "2026-11-25", 125_000);
      expect(summary.currentCycleSpendSatang).toBe(0);
      expect(summary.outstandingBalanceSatang).toBe(125_000);
    });
  });
});
