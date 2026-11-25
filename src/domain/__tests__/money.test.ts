import { describe, expect, it } from "vitest";
import {
  calculateCategoryBreakdown,
  calculateMonthlyLedgerTotals,
  formatSatang,
  MAX_SAFE_SATANG,
  parseBahtToSatang,
  satangToInputString,
  sumSatang,
} from "../money";

describe("src/domain/money", () => {
  describe("parseBahtToSatang", () => {
    it("parses whole baht, signs, currency symbols, and fractional satang without float drift", () => {
      expect(parseBahtToSatang("65")).toBe(6500);
      expect(parseBahtToSatang("+65.50")).toBe(6550);
      expect(parseBahtToSatang("65.5")).toBe(6550);
      expect(parseBahtToSatang("65.50")).toBe(6550);
      expect(parseBahtToSatang("19.99")).toBe(1999);
      expect(parseBahtToSatang("0.01")).toBe(1);
      expect(parseBahtToSatang(".5")).toBe(50);
      expect(parseBahtToSatang(".05")).toBe(5);
      expect(parseBahtToSatang("1,250.75")).toBe(125075);
      expect(parseBahtToSatang("฿ 12,345.67")).toBe(1234567);
      expect(parseBahtToSatang("+฿100.25")).toBe(10025);
      expect(parseBahtToSatang("100.")).toBe(10000);
    });

    it("round-trips negative formatted currency strings when allowNegative is true", () => {
      expect(parseBahtToSatang("-65.50")).toBeNull();
      expect(parseBahtToSatang("-65.50", { allowNegative: true })).toBe(-6550);
      expect(parseBahtToSatang("-฿65.50", { allowNegative: true })).toBe(-6550);
      expect(parseBahtToSatang("฿-65.50", { allowNegative: true })).toBe(-6550);
      expect(parseBahtToSatang(formatSatang(-6550), { allowNegative: true })).toBe(-6550);
      expect(parseBahtToSatang("-0.05", { allowNegative: true })).toBe(-5);
    });

    it("rejects zero by default unless allowZero is true", () => {
      expect(parseBahtToSatang("0")).toBeNull();
      expect(parseBahtToSatang("0.00")).toBeNull();
      expect(parseBahtToSatang("0", { allowZero: true })).toBe(0);
      expect(parseBahtToSatang("0.00", { allowZero: true })).toBe(0);
      expect(parseBahtToSatang("-0.00", { allowNegative: true, allowZero: true })).toBe(0);
    });

    it("rejects malformed strings, >2 decimal places, and out-of-range values", () => {
      expect(parseBahtToSatang("")).toBeNull();
      expect(parseBahtToSatang("   ")).toBeNull();
      expect(parseBahtToSatang(".")).toBeNull();
      expect(parseBahtToSatang("abc")).toBeNull();
      expect(parseBahtToSatang("65.123")).toBeNull();
      expect(parseBahtToSatang("1.2.3")).toBeNull();
      expect(parseBahtToSatang("1e5")).toBeNull();
      expect(parseBahtToSatang("฿฿65.50")).toBeNull();
      expect(parseBahtToSatang("฿-฿65.50", { allowNegative: true })).toBeNull();
      expect(parseBahtToSatang("1000000000.01")).toBeNull();
      expect(parseBahtToSatang("1000000001")).toBeNull();
      expect(parseBahtToSatang("1000000000.00")).toBe(MAX_SAFE_SATANG);
    });
  });

  describe("satangToInputString", () => {
    it("formats integer satang into exact two-decimal input strings", () => {
      expect(satangToInputString(0)).toBe("0.00");
      expect(satangToInputString(5)).toBe("0.05");
      expect(satangToInputString(6550)).toBe("65.50");
      expect(satangToInputString(125000)).toBe("1250.00");
      expect(satangToInputString(-1250)).toBe("-12.50");
    });

    it("throws on non-integer satang input", () => {
      expect(() => satangToInputString(65.5)).toThrow();
      expect(() => satangToInputString(Number.NaN)).toThrow();
    });
  });

  describe("formatSatang", () => {
    it("formats THB values with grouping commas and two decimal places", () => {
      expect(formatSatang(0)).toBe("฿0.00");
      expect(formatSatang(0, { showSign: true })).toBe("฿0.00");
      expect(formatSatang(5)).toBe("฿0.05");
      expect(formatSatang(6550)).toBe("฿65.50");
      expect(formatSatang(6550, { showSign: true })).toBe("+฿65.50");
      expect(formatSatang(-6550)).toBe("-฿65.50");
      expect(formatSatang(-6550, { showSign: true })).toBe("-฿65.50");
      expect(formatSatang(125000)).toBe("฿1,250.00");
      expect(formatSatang(123456789)).toBe("฿1,234,567.89");
    });

    it("throws on non-integer satang input", () => {
      expect(() => formatSatang(12.34)).toThrow();
    });
  });

  describe("sumSatang", () => {
    it("sums positive and negative satang integers accurately", () => {
      expect(sumSatang([])).toBe(0);
      expect(sumSatang([1999, 1, 6550])).toBe(8550);
      expect(sumSatang([10000, -3500])).toBe(6500);
    });

    it("throws on non-integer values", () => {
      expect(() => sumSatang([100, 0.5])).toThrow();
    });
  });

  describe("calculateMonthlyLedgerTotals", () => {
    it("excludes TRANSFER transactions from monthly spending and income totals (no double-counting)", () => {
      const totals = calculateMonthlyLedgerTotals([
        { type: "INCOME", amountSatang: 5_000_000 },
        { type: "EXPENSE", amountSatang: 6550 },
        { type: "EXPENSE", amountSatang: 120_000 },
        { type: "TRANSFER", amountSatang: 120_000 },
      ]);

      expect(totals).toEqual({
        incomeSatang: 5_000_000,
        expenseSatang: 126_550,
        transferSatang: 120_000,
        netCashFlowSatang: 4_873_450,
      });
    });

    it("returns zeroes for empty ledger", () => {
      expect(calculateMonthlyLedgerTotals([])).toEqual({
        incomeSatang: 0,
        expenseSatang: 0,
        transferSatang: 0,
        netCashFlowSatang: 0,
      });
    });
  });

  describe("calculateCategoryBreakdown", () => {
    it("aggregates EXPENSE categories including null uncategorized entries", () => {
      const breakdown = calculateCategoryBreakdown(
        [
          { type: "EXPENSE", amountSatang: 30_000, categoryId: "cat-food" },
          { type: "EXPENSE", amountSatang: 10_000, categoryId: "cat-food" },
          { type: "EXPENSE", amountSatang: 50_000, categoryId: "cat-rent" },
          { type: "EXPENSE", amountSatang: 10_000, categoryId: null },
          { type: "TRANSFER", amountSatang: 500_000, categoryId: null },
          { type: "INCOME", amountSatang: 900_000, categoryId: "cat-salary" },
        ],
        "EXPENSE",
      );

      expect(breakdown).toEqual([
        { categoryId: "cat-rent", totalSatang: 50_000, sharePercent: 50 },
        { categoryId: "cat-food", totalSatang: 40_000, sharePercent: 40 },
        { categoryId: null, totalSatang: 10_000, sharePercent: 10 },
      ]);
    });

    it("supports INCOME breakdown and BigInt-safe large totals without IEEE-754 overflow", () => {
      const breakdown = calculateCategoryBreakdown(
        [
          { type: "INCOME", amountSatang: MAX_SAFE_SATANG, categoryId: "cat-a" },
          { type: "INCOME", amountSatang: MAX_SAFE_SATANG, categoryId: "cat-a" },
          { type: "INCOME", amountSatang: MAX_SAFE_SATANG, categoryId: "cat-b" },
        ],
        "INCOME",
      );

      expect(breakdown).toEqual([
        { categoryId: "cat-a", totalSatang: MAX_SAFE_SATANG * 2, sharePercent: 67 },
        { categoryId: "cat-b", totalSatang: MAX_SAFE_SATANG, sharePercent: 33 },
      ]);
    });

    it("returns empty array when no transactions match target type", () => {
      expect(
        calculateCategoryBreakdown(
          [{ type: "TRANSFER", amountSatang: 10_000, categoryId: null }],
          "EXPENSE",
        ),
      ).toEqual([]);
    });
  });
});
