import type { TransactionType, WalletType } from "@/db/finance-schema";

export const MIN_FINANCE_YEAR = 1900;
export const MAX_FINANCE_YEAR = 2100;

export interface IsoDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export interface BillingCycleWindow {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  statementDate: string; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
}

export interface WalletBalanceInput {
  id: string;
  type: WalletType;
  initialBalanceSatang: number;
}

export interface CreditCardWalletInput extends WalletBalanceInput {
  alias: string;
  type: "CREDIT_CARD";
  statementDay: number | null;
  dueDay: number | null;
}

export interface WalletBalanceTransaction {
  type: TransactionType;
  amountSatang: number;
  walletId: string;
  toWalletId: string | null;
  transactionDate: string;
}

export interface CreditCardCycleSummary {
  walletId: string;
  alias: string;
  statementDay: number | null;
  dueDay: number | null;
  cycle: BillingCycleWindow;
  currentCycleSpendSatang: number;
  currentCyclePaymentSatang: number;
  outstandingBalanceSatang: number;
}

const THAI_SHORT_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const;

const EN_SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function getDaysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12 || !Number.isInteger(year) || !Number.isInteger(month)) {
    throw new RangeError(`Invalid year/month: ${year}-${month}`);
  }
  switch (month) {
    case 2: {
      const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      return isLeap ? 29 : 28;
    }
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

export function clampDayOfMonth(year: number, month: number, day: number): number {
  const maxDay = getDaysInMonth(year, month);
  return Math.min(Math.max(1, Math.trunc(day)), maxDay);
}

export function parseIsoDate(iso: string): IsoDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  if (year < MIN_FINANCE_YEAR || year > MAX_FINANCE_YEAR) {
    return null;
  }
  if (month < 1 || month > 12) {
    return null;
  }
  const maxDay = getDaysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }
  return { year, month, day };
}

export function isValidIsoDate(iso: string): boolean {
  return parseIsoDate(iso) !== null;
}

export function formatIsoDate(parts: IsoDateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function shiftMonthParts(year: number, month: number, deltaMonths: number): {
  year: number;
  month: number;
} {
  const zeroBased = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return { year: nextYear, month: nextMonth };
}

export function addDaysIso(iso: string, deltaDays: number): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) {
    throw new RangeError(`Invalid ISO date: ${iso}`);
  }
  const next = new Date(0);
  next.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day + deltaDays);
  return formatIsoDate({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
}

export function getBangkokTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function getMonthRange(
  yearMonth: string,
): { startDate: string; endDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  if (year < MIN_FINANCE_YEAR || year > MAX_FINANCE_YEAR || month < 1 || month > 12) {
    return null;
  }
  const lastDay = getDaysInMonth(year, month);
  return {
    startDate: formatIsoDate({ year, month, day: 1 }),
    endDate: formatIsoDate({ year, month, day: lastDay }),
  };
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  if (year < MIN_FINANCE_YEAR || year > MAX_FINANCE_YEAR || month < 1 || month > 12) {
    return null;
  }
  const next = shiftMonthParts(year, month, deltaMonths);
  if (next.year < MIN_FINANCE_YEAR || next.year > MAX_FINANCE_YEAR) {
    return null;
  }
  return `${String(next.year).padStart(4, "0")}-${String(next.month).padStart(2, "0")}`;
}

export function formatShortTransactionDate(
  isoDate: string,
  locale: "th" | "en",
): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) {
    return isoDate;
  }
  const months = locale === "th" ? THAI_SHORT_MONTHS : EN_SHORT_MONTHS;
  const monthLabel = months[parsed.month - 1] ?? "";
  return `${parsed.day} ${monthLabel} ${parsed.year}`;
}

export function formatShortDayMonth(
  isoDate: string,
  locale: "th" | "en",
): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) {
    return isoDate;
  }
  const months = locale === "th" ? THAI_SHORT_MONTHS : EN_SHORT_MONTHS;
  const monthLabel = months[parsed.month - 1] ?? "";
  return `${parsed.day} ${monthLabel}`;
}

export function formatMonthYearLabel(
  yearMonth: string,
  locale: "th" | "en",
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    return yearMonth;
  }
  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  if (month < 1 || month > 12) {
    return yearMonth;
  }
  const months = locale === "th" ? THAI_SHORT_MONTHS : EN_SHORT_MONTHS;
  const monthLabel = months[month - 1] ?? "";
  return `${monthLabel} ${year}`;
}

function computeDueDateForCycleEnd(
  cycleEnd: IsoDateParts,
  dueDay: number | null | undefined,
  statementDay: number | null,
): string | null {
  if (dueDay === null || dueDay === undefined) {
    return null;
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new RangeError(`dueDay must be between 1 and 31: ${dueDay}`);
  }
  if (statementDay !== null && dueDay > statementDay) {
    const clampedSameMonth = clampDayOfMonth(cycleEnd.year, cycleEnd.month, dueDay);
    if (clampedSameMonth > cycleEnd.day) {
      return formatIsoDate({
        year: cycleEnd.year,
        month: cycleEnd.month,
        day: clampedSameMonth,
      });
    }
  }
  const next = shiftMonthParts(cycleEnd.year, cycleEnd.month, 1);
  return formatIsoDate({
    year: next.year,
    month: next.month,
    day: clampDayOfMonth(next.year, next.month, dueDay),
  });
}

export function getCurrentBillingCycle(
  statementDay: number,
  referenceDateIso: string,
  dueDay?: number | null,
): BillingCycleWindow {
  if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 31) {
    throw new RangeError(`statementDay must be between 1 and 31: ${statementDay}`);
  }
  const ref = parseIsoDate(referenceDateIso);
  if (!ref) {
    throw new RangeError(`Invalid reference date: ${referenceDateIso}`);
  }

  const thisMonthCloseDay = clampDayOfMonth(ref.year, ref.month, statementDay);
  let endParts: IsoDateParts;
  let prevCloseIso: string;

  if (ref.day <= thisMonthCloseDay) {
    endParts = { year: ref.year, month: ref.month, day: thisMonthCloseDay };
    const prev = shiftMonthParts(ref.year, ref.month, -1);
    prevCloseIso = formatIsoDate({
      year: prev.year,
      month: prev.month,
      day: clampDayOfMonth(prev.year, prev.month, statementDay),
    });
  } else {
    prevCloseIso = formatIsoDate({
      year: ref.year,
      month: ref.month,
      day: thisMonthCloseDay,
    });
    const next = shiftMonthParts(ref.year, ref.month, 1);
    endParts = {
      year: next.year,
      month: next.month,
      day: clampDayOfMonth(next.year, next.month, statementDay),
    };
  }

  const endDate = formatIsoDate(endParts);
  const startDate = addDaysIso(prevCloseIso, 1);
  const dueDate = computeDueDateForCycleEnd(endParts, dueDay, statementDay);

  return {
    startDate,
    endDate,
    statementDate: endDate,
    dueDate,
  };
}

export function getCreditCardBillingCycleWindow(
  statementDay: number | null,
  dueDay: number | null,
  referenceDateIso: string,
): BillingCycleWindow {
  const ref = parseIsoDate(referenceDateIso);
  if (!ref) {
    throw new RangeError(`Invalid reference date: ${referenceDateIso}`);
  }

  if (statementDay !== null) {
    return getCurrentBillingCycle(statementDay, referenceDateIso, dueDay);
  }

  const endDay = getDaysInMonth(ref.year, ref.month);
  const endParts: IsoDateParts = { year: ref.year, month: ref.month, day: endDay };
  const startDate = formatIsoDate({ year: ref.year, month: ref.month, day: 1 });
  const endDate = formatIsoDate(endParts);
  return {
    startDate,
    endDate,
    statementDate: endDate,
    dueDate: computeDueDateForCycleEnd(endParts, dueDay, null),
  };
}

export function calculateWalletBalanceSatang(
  wallet: WalletBalanceInput,
  transactions: readonly WalletBalanceTransaction[],
): number {
  let balance = BigInt(wallet.initialBalanceSatang);

  for (const tx of transactions) {
    const amount = BigInt(tx.amountSatang);
    if (wallet.type === "CREDIT_CARD") {
      // Positive balance represents amount owed on the card
      if (tx.type === "EXPENSE" && tx.walletId === wallet.id) {
        balance += amount;
      } else if (tx.type === "INCOME" && tx.walletId === wallet.id) {
        balance -= amount;
      } else if (tx.type === "TRANSFER") {
        if (tx.walletId === wallet.id) {
          balance += amount;
        }
        if (tx.toWalletId === wallet.id) {
          balance -= amount;
        }
      }
    } else {
      // Asset account (BANK_CASH / EWALLET): positive represents available funds
      if (tx.type === "INCOME" && tx.walletId === wallet.id) {
        balance += amount;
      } else if (tx.type === "EXPENSE" && tx.walletId === wallet.id) {
        balance -= amount;
      } else if (tx.type === "TRANSFER") {
        if (tx.walletId === wallet.id) {
          balance -= amount;
        }
        if (tx.toWalletId === wallet.id) {
          balance += amount;
        }
      }
    }
  }

  const numericBalance = Number(balance);
  if (!Number.isSafeInteger(numericBalance)) {
    throw new RangeError("Wallet balance exceeds safe integer bounds");
  }
  return numericBalance;
}

export function calculateCreditCardSummary(
  wallet: CreditCardWalletInput,
  transactions: readonly WalletBalanceTransaction[],
  referenceDateIso: string,
  precomputedOutstandingSatang?: number,
): CreditCardCycleSummary {
  const cycle = getCreditCardBillingCycleWindow(
    wallet.statementDay,
    wallet.dueDay,
    referenceDateIso,
  );

  let currentCycleSpend = 0n;
  let currentCyclePayment = 0n;

  for (const tx of transactions) {
    if (tx.transactionDate < cycle.startDate || tx.transactionDate > cycle.endDate) {
      continue;
    }

    const amount = BigInt(tx.amountSatang);
    if (tx.type === "EXPENSE" && tx.walletId === wallet.id) {
      currentCycleSpend += amount;
    } else if (tx.type === "INCOME" && tx.walletId === wallet.id) {
      currentCycleSpend -= amount;
    } else if (tx.type === "TRANSFER" && tx.toWalletId === wallet.id) {
      currentCyclePayment += amount;
    }
  }

  const currentCycleSpendSatang = Number(currentCycleSpend);
  const currentCyclePaymentSatang = Number(currentCyclePayment);
  if (
    !Number.isSafeInteger(currentCycleSpendSatang) ||
    !Number.isSafeInteger(currentCyclePaymentSatang)
  ) {
    throw new RangeError("Cycle total exceeds safe integer bounds");
  }

  const outstandingBalanceSatang =
    precomputedOutstandingSatang !== undefined
      ? precomputedOutstandingSatang
      : calculateWalletBalanceSatang(wallet, transactions);

  return {
    walletId: wallet.id,
    alias: wallet.alias,
    statementDay: wallet.statementDay,
    dueDay: wallet.dueDay,
    cycle,
    currentCycleSpendSatang,
    currentCyclePaymentSatang,
    outstandingBalanceSatang,
  };
}
