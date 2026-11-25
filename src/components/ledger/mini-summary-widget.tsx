"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CreditCard,
  Landmark,
  Smartphone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  formatMonthYearLabel,
  formatShortDayMonth,
  type CreditCardCycleSummary,
} from "@/domain/billing-cycle";
import type {
  SerializedCategory,
  SerializedTransaction,
  SerializedWallet,
} from "@/domain/ledger-types";
import {
  calculateCategoryBreakdown,
  formatSatang,
  type MonthlyLedgerTotals,
} from "@/domain/money";

interface MiniSummaryWidgetProps {
  month: string;
  locale: "th" | "en";
  isLoadingMonth: boolean;
  monthlyTotals: MonthlyLedgerTotals;
  creditCardSummaries: CreditCardCycleSummary[];
  wallets: SerializedWallet[];
  walletBalances: Record<string, number>;
  categories: SerializedCategory[];
  transactions: SerializedTransaction[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function MiniSummaryWidget({
  month,
  locale,
  isLoadingMonth,
  monthlyTotals,
  creditCardSummaries,
  wallets,
  walletBalances,
  categories,
  transactions,
  onPrevMonth,
  onNextMonth,
}: MiniSummaryWidgetProps) {
  const t = useTranslations("ledger");
  const [expanded, setExpanded] = useState(false);

  const activeAssetWallets = wallets.filter(
    (wallet) => wallet.isActive && wallet.type !== "CREDIT_CARD",
  );
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));
  const expenseBreakdown = calculateCategoryBreakdown(transactions, "EXPENSE");

  const hasExpandableDetails =
    activeAssetWallets.length > 0 || expenseBreakdown.length > 0;

  return (
    <div className="space-y-3">
      <section
        aria-busy={isLoadingMonth}
        className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={isLoadingMonth}
            onClick={onPrevMonth}
            aria-label={t("previousMonth")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <p className="text-[15px] font-semibold tabular-nums text-text-primary">
            {formatMonthYearLabel(month, locale)}
          </p>

          <button
            type="button"
            disabled={isLoadingMonth}
            onClick={onNextMonth}
            aria-label={t("nextMonth")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
            {t("summaryLabel")}
          </p>
          {isLoadingMonth ? (
            <div className="h-10 w-44 animate-pulse rounded-xl bg-elevated" />
          ) : (
            <p className="text-[32px] font-bold tracking-tight tabular-nums text-text-primary">
              {formatSatang(monthlyTotals.expenseSatang)}
            </p>
          )}
          <p className="text-[12px] text-text-muted">
            {t("transferExcludedHint")}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border-subtle pt-3">
          <div className="space-y-1">
            <p className="text-[12px] text-text-secondary">
              {t("monthlyIncomeLabel")}
            </p>
            {isLoadingMonth ? (
              <div className="h-5 w-20 animate-pulse rounded bg-elevated" />
            ) : (
              <p className="truncate text-[14px] font-semibold tabular-nums text-status-income">
                {formatSatang(monthlyTotals.incomeSatang)}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[12px] text-text-secondary">
              {t("netCashFlowLabel")}
            </p>
            {isLoadingMonth ? (
              <div className="h-5 w-20 animate-pulse rounded bg-elevated" />
            ) : (
              <p
                className={`truncate text-[14px] font-semibold tabular-nums ${
                  monthlyTotals.netCashFlowSatang >= 0
                    ? "text-text-primary"
                    : "text-status-expense"
                }`}
              >
                {formatSatang(monthlyTotals.netCashFlowSatang, { showSign: true })}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[12px] text-text-secondary">
              {t("monthlyTransferLabel")}
            </p>
            {isLoadingMonth ? (
              <div className="h-5 w-20 animate-pulse rounded bg-elevated" />
            ) : (
              <p className="truncate text-[14px] font-semibold tabular-nums text-status-transfer">
                {formatSatang(monthlyTotals.transferSatang)}
              </p>
            )}
          </div>
        </div>

        {hasExpandableDetails && (
          <div className="border-t border-border-subtle pt-2">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((prev) => !prev)}
              className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-elevated hover:text-text-primary"
            >
              <span>
                {expanded ? t("collapseDetails") : t("expandDetails")}
              </span>
              {expanded ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            {expanded && (
              <div className="mt-2 space-y-4 border-t border-border-subtle pt-3">
                {activeAssetWallets.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
                      {t("walletsOverviewTitle")}
                    </p>
                    <ul className="space-y-2">
                      {activeAssetWallets.map((wallet) => {
                        const balance =
                          walletBalances[wallet.id] ?? wallet.initialBalanceSatang;
                        return (
                          <li
                            key={wallet.id}
                            className="flex items-center justify-between gap-2 rounded-xl bg-elevated px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2 text-text-primary">
                              {wallet.type === "EWALLET" ? (
                                <Smartphone
                                  className="h-4 w-4 shrink-0 text-brand-accent"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Landmark
                                  className="h-4 w-4 shrink-0 text-brand-accent"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate text-[14px] font-medium">
                                {wallet.alias}
                              </span>
                            </div>
                            <span
                              className={`shrink-0 text-[14px] font-semibold tabular-nums ${
                                balance < 0
                                  ? "text-status-expense"
                                  : "text-text-primary"
                              }`}
                            >
                              {formatSatang(balance)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {expenseBreakdown.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
                      {t("categoryBreakdownTitle")}
                    </p>
                    <ul className="space-y-3">
                      {expenseBreakdown.slice(0, 6).map((entry) => {
                        const label = entry.categoryId
                          ? (categoryMap.get(entry.categoryId) ?? t("uncategorized"))
                          : t("uncategorized");
                        return (
                          <li key={entry.categoryId ?? "none"} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[13px]">
                              <span className="truncate font-medium text-text-primary">
                                {label}
                              </span>
                              <span className="shrink-0 tabular-nums text-text-secondary">
                                {formatSatang(entry.totalSatang)} ({entry.sharePercent}%)
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
                              <div
                                className="h-full rounded-full bg-brand-accent"
                                style={{
                                  width: `${Math.max(4, Math.min(100, entry.sharePercent))}%`,
                                }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {creditCardSummaries.length > 0 && (
        <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
            {t("creditCardsTitle")}
          </h2>
          <ul className="space-y-3">
            {creditCardSummaries.map((card) => {
              const isPaidOff = card.outstandingBalanceSatang <= 0;
              return (
                <li
                  key={card.walletId}
                  className="rounded-xl border border-border-subtle bg-elevated p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <CreditCard
                        className="h-4 w-4 shrink-0 text-brand-accent"
                        aria-hidden="true"
                      />
                      <span className="truncate text-[15px] font-semibold text-text-primary">
                        {card.alias}
                      </span>
                    </div>
                    {card.cycle.dueDate && (
                      <span className="shrink-0 rounded-lg bg-surface px-2 py-1 text-[12px] font-medium tabular-nums text-status-warning">
                        {t("dueDateLabel")}{" "}
                        {formatShortDayMonth(card.cycle.dueDate, locale)}
                      </span>
                    )}
                  </div>

                  <p className="text-[12px] tabular-nums text-text-secondary">
                    {t("cycleLabel")}:{" "}
                    {formatShortDayMonth(card.cycle.startDate, locale)} –{" "}
                    {formatShortDayMonth(card.cycle.endDate, locale)}
                    {card.statementDay === null
                      ? ` (${t("noCycleConfigured")})`
                      : ""}
                  </p>

                  <div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-2">
                    <div>
                      <p className="text-[12px] text-text-secondary">
                        {t("cycleSpendLabel")}
                      </p>
                      <p className="text-[15px] font-semibold tabular-nums text-text-primary">
                        {formatSatang(card.currentCycleSpendSatang)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] text-text-secondary">
                        {t("outstandingLabel")}
                      </p>
                      {isPaidOff ? (
                        <p className="text-[15px] font-semibold tabular-nums text-status-income">
                          {card.outstandingBalanceSatang === 0
                            ? t("paidOffBadge")
                            : formatSatang(card.outstandingBalanceSatang)}
                        </p>
                      ) : (
                        <p className="text-[15px] font-semibold tabular-nums text-status-expense">
                          {formatSatang(card.outstandingBalanceSatang)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
