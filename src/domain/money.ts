import type { TransactionType } from "@/db/finance-schema";

export const MAX_SAFE_SATANG = 100_000_000_000; // 1,000,000,000.00 THB

export interface ParseBahtOptions {
  allowNegative?: boolean;
  allowZero?: boolean;
}

export interface FormatSatangOptions {
  showSign?: boolean;
  symbol?: string;
}

export interface LedgerAmountItem {
  type: TransactionType;
  amountSatang: number;
}

export interface MonthlyLedgerTotals {
  incomeSatang: number;
  expenseSatang: number;
  transferSatang: number;
  netCashFlowSatang: number;
}

export interface CategoryAmountItem {
  type: TransactionType;
  amountSatang: number;
  categoryId: string | null;
}

export interface CategoryBreakdownEntry {
  categoryId: string | null;
  totalSatang: number;
  sharePercent: number;
}

function assertSafeSatang(value: number, label = "satang"): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer (minor units)`);
  }
}

function addGroupingCommas(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function parseBahtToSatang(
  input: string,
  options: ParseBahtOptions = {},
): number | null {
  const { allowNegative = false, allowZero = false } = options;
  const compact = input.trim().replace(/[\s,]/g, "");
  if (compact.length === 0) {
    return null;
  }

  // Strip at most one currency symbol either before or after an optional sign (rejects "฿฿65.50" & "฿-฿65.50")
  const hadLeadingSymbol = compact.startsWith("฿");
  let normalized = hadLeadingSymbol ? compact.slice(1) : compact;
  let isNegative = false;
  if (normalized.startsWith("-")) {
    isNegative = true;
    normalized = normalized.slice(1);
  } else if (normalized.startsWith("+")) {
    normalized = normalized.slice(1);
  }
  const unsigned =
    !hadLeadingSymbol && normalized.startsWith("฿")
      ? normalized.slice(1)
      : normalized;

  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(unsigned)) {
    return null;
  }

  const [wholeRaw = "", fracRaw = ""] = unsigned.split(".");
  const wholePart = wholeRaw.length > 0 ? Number.parseInt(wholeRaw, 10) : 0;
  const fracPart =
    fracRaw.length > 0 ? Number.parseInt(fracRaw.padEnd(2, "0"), 10) : 0;

  if (!Number.isSafeInteger(wholePart) || !Number.isSafeInteger(fracPart)) {
    return null;
  }

  if (wholePart > Math.floor(MAX_SAFE_SATANG / 100)) {
    return null;
  }

  const magnitude = wholePart * 100 + fracPart;
  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_SAFE_SATANG) {
    return null;
  }

  if (magnitude === 0) {
    return allowZero ? 0 : null;
  }

  if (isNegative && !allowNegative) {
    return null;
  }

  return isNegative ? -magnitude : magnitude;
}

export function satangToInputString(satang: number): string {
  assertSafeSatang(satang);
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(satang);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${String(frac).padStart(2, "0")}`;
}

export function formatSatang(
  satang: number,
  options: FormatSatangOptions = {},
): string {
  assertSafeSatang(satang);
  const { showSign = false, symbol = "฿" } = options;

  const abs = Math.abs(satang);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const formattedAbs = `${symbol}${addGroupingCommas(String(whole))}.${String(frac).padStart(2, "0")}`;

  if (satang < 0) {
    return `-${formattedAbs}`;
  }
  if (satang > 0 && showSign) {
    return `+${formattedAbs}`;
  }
  return formattedAbs;
}

export function sumSatang(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertSafeSatang(value);
    total += value;
    assertSafeSatang(total, "sum");
  }
  return total;
}

export function calculateMonthlyLedgerTotals(
  items: readonly LedgerAmountItem[],
): MonthlyLedgerTotals {
  let incomeSatang = 0;
  let expenseSatang = 0;
  let transferSatang = 0;

  for (const item of items) {
    assertSafeSatang(item.amountSatang, "amountSatang");
    if (item.type === "INCOME") {
      incomeSatang += item.amountSatang;
    } else if (item.type === "EXPENSE") {
      expenseSatang += item.amountSatang;
    } else {
      transferSatang += item.amountSatang;
    }
  }

  assertSafeSatang(incomeSatang, "incomeSatang");
  assertSafeSatang(expenseSatang, "expenseSatang");
  assertSafeSatang(transferSatang, "transferSatang");

  return {
    incomeSatang,
    expenseSatang,
    transferSatang,
    netCashFlowSatang: incomeSatang - expenseSatang,
  };
}

export function calculateCategoryBreakdown(
  items: readonly CategoryAmountItem[],
  targetType: "EXPENSE" | "INCOME",
): CategoryBreakdownEntry[] {
  const totalsByCategory = new Map<string | null, bigint>();
  let grandTotal = 0n;

  for (const item of items) {
    if (item.type !== targetType) {
      continue;
    }
    assertSafeSatang(item.amountSatang, "amountSatang");
    const amountBig = BigInt(item.amountSatang);
    grandTotal += amountBig;
    const prev = totalsByCategory.get(item.categoryId) ?? 0n;
    totalsByCategory.set(item.categoryId, prev + amountBig);
  }

  if (grandTotal <= 0n) {
    return [];
  }

  const entries: CategoryBreakdownEntry[] = [];
  for (const [categoryId, totalBig] of totalsByCategory.entries()) {
    const sharePercent = Number(
      (totalBig * 100n + grandTotal / 2n) / grandTotal,
    );
    const totalSatang = Number(totalBig);
    assertSafeSatang(totalSatang, "categoryTotalSatang");
    entries.push({ categoryId, totalSatang, sharePercent });
  }

  entries.sort((a, b) => b.totalSatang - a.totalSatang);
  return entries;
}
