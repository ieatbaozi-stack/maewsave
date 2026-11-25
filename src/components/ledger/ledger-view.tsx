"use client";

import {
  AlertCircle,
  ArrowLeftRight,
  Plus,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MaewsaveMark } from "@/components/brand/maewsave-mark";
import { QUICK_ADD_EVENT } from "@/components/layout/app-shell";
import { MiniSummaryWidget } from "@/components/ledger/mini-summary-widget";
import { TransactionSheet } from "@/components/ledger/transaction-sheet";
import { CategoryIcon } from "@/components/ui/category-icon";
import type { TransactionType } from "@/db/finance-schema";
import {
  formatShortTransactionDate,
  shiftYearMonth,
} from "@/domain/billing-cycle";
import { applyTransactionMutationToOverview } from "@/domain/ledger-optimistic";
import type {
  LedgerOverview,
  SerializedTransaction,
} from "@/domain/ledger-types";
import { formatSatang } from "@/domain/money";
import type { TransactionPayloadInput } from "@/lib/validation/finance";

interface LedgerViewProps {
  initialOverview: LedgerOverview;
  locale: "th" | "en";
  initialOpenCompose?: boolean;
}

type TypeFilter = "ALL" | TransactionType;

interface LedgerToast {
  message: string;
  transaction: SerializedTransaction | null;
  canUndo: boolean;
  canEdit: boolean;
}

let tempIdCounter = 0;
function createTempTransactionId(): string {
  tempIdCounter += 1;
  return `temp-${tempIdCounter}`;
}

export function LedgerView({
  initialOverview,
  locale,
  initialOpenCompose = false,
}: LedgerViewProps) {
  const router = useRouter();
  const t = useTranslations("ledger");
  const tCommon = useTranslations("common");

  const [overview, setOverview] = useState<LedgerOverview>(initialOverview);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failedMonth, setFailedMonth] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [walletFilter, setWalletFilter] = useState<string>("ALL");

  const activeWalletsCount = useMemo(
    () => overview.wallets.filter((w) => w.isActive).length,
    [overview.wallets],
  );

  const [sheetOpen, setSheetOpen] = useState(
    () => initialOpenCompose && activeWalletsCount > 0,
  );
  const [sheetKey, setSheetKey] = useState(0);
  const [editingTx, setEditingTx] = useState<SerializedTransaction | null>(null);

  const [toast, setToast] = useState<LedgerToast | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const monthAbortRef = useRef<AbortController | null>(null);

  // Concurrency guards for optimistic mutations across month switches & rapid edits/undos
  const overviewEpochRef = useRef(0);
  const currentMonthRef = useRef(initialOverview.month);
  const tempToRealIdRef = useRef<Map<string, string>>(new Map());
  const pendingCreatesRef = useRef<
    Map<string, Promise<SerializedTransaction | null>>
  >(new Map());
  const pendingUndoTempIdsRef = useRef<Set<string>>(new Set());
  const supersededTempIdsRef = useRef<Set<string>>(new Set());
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const editSeqByTxRef = useRef<Map<string, number>>(new Map());

  const showToast = useCallback((nextToast: LedgerToast) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(nextToast);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 5500);
  }, []);

  const openCreateSheet = useCallback(() => {
    if (activeWalletsCount === 0) {
      router.push("/settings");
      return;
    }
    setEditingTx(null);
    setSheetKey((prev) => prev + 1);
    setSheetOpen(true);
  }, [activeWalletsCount, router]);

  function openEditSheet(tx: SerializedTransaction) {
    const resolvedId = tempToRealIdRef.current.get(tx.id) ?? tx.id;
    const latest =
      overview.transactions.find(
        (item) => item.id === resolvedId || item.id === tx.id,
      ) ?? {
        ...tx,
        id: resolvedId,
      };
    setEditingTx(latest);
    setSheetKey((prev) => prev + 1);
    setSheetOpen(true);
  }

  // Strip ?compose=1 from address bar after initial compose trigger
  useEffect(() => {
    if (initialOpenCompose && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("compose")) {
        url.searchParams.delete("compose");
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      }
    }
  }, [initialOpenCompose]);

  // Listen to center '+' button in AppShell Bottom Nav
  useEffect(() => {
    function handleQuickAddEvent() {
      openCreateSheet();
    }
    window.addEventListener(QUICK_ADD_EVENT, handleQuickAddEvent);
    return () => {
      window.removeEventListener(QUICK_ADD_EVENT, handleQuickAddEvent);
    };
  }, [openCreateSheet]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      monthAbortRef.current?.abort();
    };
  }, []);

  const fetchMonthOverview = useCallback(
    async (targetMonth: string) => {
      monthAbortRef.current?.abort();
      const controller = new AbortController();
      monthAbortRef.current = controller;

      setIsLoadingMonth(true);
      setLoadError(null);

      try {
        const res = await fetch(
          `/api/transactions?overview=1&month=${encodeURIComponent(targetMonth)}`,
          { signal: controller.signal },
        );

        if (!res.ok) {
          setFailedMonth(targetMonth);
          setLoadError(t("loadError"));
          return;
        }

        const data = (await res.json()) as { overview: LedgerOverview };
        overviewEpochRef.current += 1;
        currentMonthRef.current = data.overview.month;
        setFailedMonth(null);
        setOverview(data.overview);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setFailedMonth(targetMonth);
        setLoadError(t("loadError"));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingMonth(false);
        }
      }
    },
    [t],
  );

  function handleStepMonth(delta: number) {
    const nextMonth = shiftYearMonth(overview.month, delta);
    if (!nextMonth) {
      return;
    }
    void fetchMonthOverview(nextMonth);
  }

  async function handleSaveTransaction(
    payload: TransactionPayloadInput,
    editingId: string | null,
  ) {
    setMutationError(null);
    const startedEpoch = overviewEpochRef.current;

    if (editingId === null) {
      const tempId = createTempTransactionId();
      const nowIso = new Date().toISOString();
      const optimisticTx: SerializedTransaction = {
        id: tempId,
        type: payload.type,
        amountSatang: payload.amountSatang,
        walletId: payload.walletId,
        toWalletId: payload.toWalletId ?? null,
        categoryId: payload.categoryId ?? null,
        merchant: payload.merchant,
        note: payload.note ?? null,
        transactionDate: payload.transactionDate,
        source: "MANUAL",
        isReconciled: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setOverview((prev) =>
        applyTransactionMutationToOverview(prev, null, optimisticTx),
      );
      setSheetOpen(false);
      showToast({
        message: t("toastSaved"),
        transaction: optimisticTx,
        canUndo: true,
        canEdit: true,
      });

      const createPromise: Promise<SerializedTransaction | null> = (async () => {
        try {
          const res = await fetch("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            return null;
          }
          const data = (await res.json()) as {
            transaction: SerializedTransaction;
          };
          tempToRealIdRef.current.set(tempId, data.transaction.id);
          return data.transaction;
        } catch {
          return null;
        }
      })();

      pendingCreatesRef.current.set(tempId, createPromise);
      const created = await createPromise;
      pendingCreatesRef.current.delete(tempId);

      const wasUndone = pendingUndoTempIdsRef.current.has(tempId);
      pendingUndoTempIdsRef.current.delete(tempId);
      const wasSuperseded = supersededTempIdsRef.current.has(tempId);

      if (!created) {
        if (wasSuperseded) {
          supersededTempIdsRef.current.delete(tempId);
          return;
        }
        if (!wasUndone) {
          if (overviewEpochRef.current === startedEpoch) {
            setOverview((prev) =>
              applyTransactionMutationToOverview(prev, optimisticTx, null),
            );
          } else {
            void fetchMonthOverview(currentMonthRef.current);
          }
          setMutationError(t("actionError"));
          setToast(null);
        }
        return;
      }

      // Handle deferred Undo in its own isolated try/catch so failed DELETE restores truth without double-rollback
      if (wasUndone) {
        let deferredDeleteOk = false;
        try {
          const delRes = await fetch(`/api/transactions/${created.id}`, {
            method: "DELETE",
          });
          deferredDeleteOk = delRes.ok;
        } catch {
          deferredDeleteOk = false;
        }

        if (!deferredDeleteOk) {
          deletedIdsRef.current.delete(tempId);
          deletedIdsRef.current.delete(created.id);
          if (overviewEpochRef.current === startedEpoch) {
            setOverview((prev) =>
              applyTransactionMutationToOverview(prev, null, created),
            );
          } else {
            void fetchMonthOverview(currentMonthRef.current);
          }
          setMutationError(t("actionError"));
          setToast(null);
        }
        return;
      }

      // Do not overwrite a newer edit that superseded this temp transaction
      if (wasSuperseded) {
        supersededTempIdsRef.current.delete(tempId);
        return;
      }

      if (overviewEpochRef.current !== startedEpoch) {
        void fetchMonthOverview(currentMonthRef.current);
        return;
      }

      setOverview((prev) =>
        applyTransactionMutationToOverview(prev, optimisticTx, created),
      );
      setToast((prev) =>
        prev && prev.transaction?.id === tempId
          ? { ...prev, transaction: created }
          : prev,
      );
      return;
    }

    // Edit existing transaction (awaiting in-flight create first if still temp-*)
    const mappedId = tempToRealIdRef.current.get(editingId) ?? editingId;
    const previousTx =
      overview.transactions.find(
        (item) => item.id === mappedId || item.id === editingId,
      ) ?? editingTx;
    if (!previousTx) {
      setSheetOpen(false);
      return;
    }

    if (editingId.startsWith("temp-")) {
      supersededTempIdsRef.current.add(editingId);
    }

    const optimisticUpdated: SerializedTransaction = {
      ...previousTx,
      type: payload.type,
      amountSatang: payload.amountSatang,
      walletId: payload.walletId,
      toWalletId: payload.toWalletId ?? null,
      categoryId: payload.categoryId ?? null,
      merchant: payload.merchant,
      note: payload.note ?? null,
      transactionDate: payload.transactionDate,
      updatedAt: new Date().toISOString(),
    };

    const nextSeq = (editSeqByTxRef.current.get(previousTx.id) ?? 0) + 1;
    editSeqByTxRef.current.set(previousTx.id, nextSeq);

    setOverview((prev) =>
      applyTransactionMutationToOverview(prev, previousTx, optimisticUpdated),
    );
    setSheetOpen(false);
    showToast({
      message: t("toastUpdated"),
      transaction: optimisticUpdated,
      canUndo: false,
      canEdit: true,
    });

    let targetId = mappedId;
    if (targetId.startsWith("temp-")) {
      const pendingCreate = pendingCreatesRef.current.get(targetId);
      const created = pendingCreate ? await pendingCreate : null;
      const resolvedAfterWait =
        created?.id ?? tempToRealIdRef.current.get(targetId);
      if (!resolvedAfterWait || resolvedAfterWait.startsWith("temp-")) {
        const alreadyHandled =
          deletedIdsRef.current.has(editingId) ||
          deletedIdsRef.current.has(previousTx.id) ||
          editSeqByTxRef.current.get(previousTx.id) !== nextSeq;
        if (!alreadyHandled) {
          if (overviewEpochRef.current === startedEpoch) {
            setOverview((prev) =>
              applyTransactionMutationToOverview(prev, optimisticUpdated, null),
            );
          } else {
            void fetchMonthOverview(currentMonthRef.current);
          }
          setMutationError(t("actionError"));
          setToast(null);
        }
        return;
      }
      targetId = resolvedAfterWait;
    }

    // Abort PATCH if a newer edit or delete superseded this in-flight edit while waiting for create
    const deletedBeforePatch =
      deletedIdsRef.current.has(editingId) ||
      deletedIdsRef.current.has(previousTx.id) ||
      deletedIdsRef.current.has(targetId) ||
      pendingUndoTempIdsRef.current.has(editingId) ||
      pendingUndoTempIdsRef.current.has(previousTx.id);
    if (
      deletedBeforePatch ||
      editSeqByTxRef.current.get(previousTx.id) !== nextSeq ||
      (targetId !== previousTx.id &&
        (editSeqByTxRef.current.get(targetId) ?? 0) > nextSeq)
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/transactions/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const isDeletedAfterPatch =
        deletedIdsRef.current.has(editingId) ||
        deletedIdsRef.current.has(previousTx.id) ||
        deletedIdsRef.current.has(targetId);

      if (isDeletedAfterPatch) {
        return;
      }

      const isSuperseded =
        editSeqByTxRef.current.get(previousTx.id) !== nextSeq ||
        overviewEpochRef.current !== startedEpoch;

      if (!res.ok) {
        if (isSuperseded) {
          void fetchMonthOverview(currentMonthRef.current);
        } else {
          setOverview((prev) =>
            applyTransactionMutationToOverview(
              prev,
              optimisticUpdated,
              previousTx,
            ),
          );
        }
        setMutationError(t("actionError"));
        setToast(null);
        return;
      }

      if (isSuperseded) {
        void fetchMonthOverview(currentMonthRef.current);
        return;
      }

      const data = (await res.json()) as { transaction: SerializedTransaction };
      setOverview((prev) =>
        applyTransactionMutationToOverview(
          prev,
          optimisticUpdated,
          data.transaction,
        ),
      );
      setToast((prev) =>
        prev &&
        (prev.transaction?.id === previousTx.id ||
          prev.transaction?.id === targetId)
          ? { ...prev, transaction: data.transaction }
          : prev,
      );
    } catch {
      if (
        deletedIdsRef.current.has(editingId) ||
        deletedIdsRef.current.has(previousTx.id) ||
        deletedIdsRef.current.has(targetId)
      ) {
        return;
      }
      const isSuperseded =
        editSeqByTxRef.current.get(previousTx.id) !== nextSeq ||
        overviewEpochRef.current !== startedEpoch;
      if (isSuperseded) {
        void fetchMonthOverview(currentMonthRef.current);
      } else {
        setOverview((prev) =>
          applyTransactionMutationToOverview(
            prev,
            optimisticUpdated,
            previousTx,
          ),
        );
      }
      setMutationError(t("actionError"));
      setToast(null);
    }
  }

  async function handleDeleteTransaction(
    tx: SerializedTransaction,
    options: { isUndo?: boolean } = {},
  ) {
    setMutationError(null);
    const startedEpoch = overviewEpochRef.current;
    const resolvedId = tempToRealIdRef.current.get(tx.id) ?? tx.id;

    deletedIdsRef.current.add(tx.id);
    deletedIdsRef.current.add(resolvedId);
    editSeqByTxRef.current.set(
      tx.id,
      (editSeqByTxRef.current.get(tx.id) ?? 0) + 1,
    );
    if (resolvedId !== tx.id) {
      editSeqByTxRef.current.set(
        resolvedId,
        (editSeqByTxRef.current.get(resolvedId) ?? 0) + 1,
      );
    }

    setOverview((prev) => applyTransactionMutationToOverview(prev, tx, null));
    setSheetOpen(false);

    if (resolvedId.startsWith("temp-")) {
      pendingUndoTempIdsRef.current.add(resolvedId);
      showToast({
        message: t("toastUndone"),
        transaction: null,
        canUndo: false,
        canEdit: false,
      });
      return;
    }

    showToast({
      message: options.isUndo ? t("toastUndone") : t("toastDeleted"),
      transaction: null,
      canUndo: false,
      canEdit: false,
    });

    try {
      const res = await fetch(`/api/transactions/${resolvedId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        deletedIdsRef.current.delete(tx.id);
        deletedIdsRef.current.delete(resolvedId);
        if (overviewEpochRef.current === startedEpoch) {
          setOverview((prev) => applyTransactionMutationToOverview(prev, null, tx));
        } else {
          void fetchMonthOverview(currentMonthRef.current);
        }
        setMutationError(t("actionError"));
        setToast(null);
      }
    } catch {
      deletedIdsRef.current.delete(tx.id);
      deletedIdsRef.current.delete(resolvedId);
      if (overviewEpochRef.current === startedEpoch) {
        setOverview((prev) => applyTransactionMutationToOverview(prev, null, tx));
      } else {
        void fetchMonthOverview(currentMonthRef.current);
      }
      setMutationError(t("actionError"));
      setToast(null);
    }
  }

  async function handleToastUndo() {
    if (!toast?.transaction) {
      return;
    }
    const target = toast.transaction;
    setToast(null);
    await handleDeleteTransaction(target, { isUndo: true });
  }

  const walletMap = useMemo(
    () => new Map(overview.wallets.map((w) => [w.id, w])),
    [overview.wallets],
  );
  const categoryMap = useMemo(
    () => new Map(overview.categories.map((c) => [c.id, c])),
    [overview.categories],
  );

  const filteredTransactions = useMemo(() => {
    return overview.transactions.filter((tx) => {
      if (typeFilter !== "ALL" && tx.type !== typeFilter) {
        return false;
      }
      if (
        walletFilter !== "ALL" &&
        tx.walletId !== walletFilter &&
        tx.toWalletId !== walletFilter
      ) {
        return false;
      }
      return true;
    });
  }, [overview.transactions, typeFilter, walletFilter]);

  const groupedByDate = useMemo(() => {
    const groups: {
      date: string;
      items: SerializedTransaction[];
      dailyExpenseSatang: number;
    }[] = [];

    for (const tx of filteredTransactions) {
      const last = groups[groups.length - 1];
      const expenseContribution = tx.type === "EXPENSE" ? tx.amountSatang : 0;
      if (last && last.date === tx.transactionDate) {
        last.items.push(tx);
        last.dailyExpenseSatang += expenseContribution;
      } else {
        groups.push({
          date: tx.transactionDate,
          items: [tx],
          dailyExpenseSatang: expenseContribution,
        });
      }
    }
    return groups;
  }, [filteredTransactions]);

  const hasActiveFilters = typeFilter !== "ALL" || walletFilter !== "ALL";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-semibold text-text-primary">
          {t("pageTitle")}
        </h1>
        {activeWalletsCount > 0 && (
          <button
            type="button"
            onClick={openCreateSheet}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-elevated px-4 text-[14px] font-semibold text-brand-accent transition-opacity active:opacity-85"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t("createTitle")}</span>
          </button>
        )}
      </div>

      <MiniSummaryWidget
        month={overview.month}
        locale={locale}
        isLoadingMonth={isLoadingMonth}
        monthlyTotals={overview.monthlyTotals}
        creditCardSummaries={overview.creditCardSummaries}
        wallets={overview.wallets}
        walletBalances={overview.walletBalances}
        categories={overview.categories}
        transactions={overview.transactions}
        onPrevMonth={() => handleStepMonth(-1)}
        onNextMonth={() => handleStepMonth(1)}
      />

      {mutationError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-status-expense bg-surface p-4 text-[13px] text-status-expense"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{mutationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMutationError(null)}
            className="min-h-11 min-w-11 shrink-0 rounded-xl px-3 text-[13px] font-semibold text-text-primary"
          >
            {tCommon("close")}
          </button>
        </div>
      )}

      {loadError && (
        <section
          role="alert"
          className="rounded-2xl border border-status-expense bg-surface p-5 text-center space-y-3"
        >
          <p className="text-[14px] text-status-expense">{loadError}</p>
          <button
            type="button"
            onClick={() =>
              void fetchMonthOverview(failedMonth ?? overview.month)
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-accent px-4 text-[14px] font-semibold text-brand-accent-fg"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>{tCommon("retry")}</span>
          </button>
        </section>
      )}

      {overview.wallets.length > 0 && (
        <section className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { value: "ALL", label: t("filterAll") },
                { value: "EXPENSE", label: t("filterExpense") },
                { value: "INCOME", label: t("filterIncome") },
                { value: "TRANSFER", label: t("filterTransfer") },
              ] as const
            ).map((option) => {
              const selected = typeFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTypeFilter(option.value)}
                  className={`min-h-11 rounded-xl px-2 text-[13px] font-medium transition-colors ${
                    selected
                      ? "bg-brand-accent text-brand-accent-fg"
                      : "border border-border-subtle bg-surface text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <select
            aria-label={t("walletLabel")}
            value={walletFilter}
            onChange={(event) => setWalletFilter(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface px-4 text-base text-text-primary"
          >
            <option value="ALL">{t("filterAllWallets")}</option>
            {overview.wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.alias}
              </option>
            ))}
          </select>
        </section>
      )}

      {isLoadingMonth ? (
        <div
          role="status"
          aria-busy="true"
          className="space-y-3 animate-pulse"
        >
          <span className="sr-only">{tCommon("loading")}</span>
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3"
            >
              <div className="h-4 w-28 rounded bg-elevated" />
              <div className="h-12 w-full rounded-xl bg-elevated" />
              <div className="h-12 w-full rounded-xl bg-elevated" />
            </div>
          ))}
        </div>
      ) : activeWalletsCount === 0 && overview.transactions.length === 0 ? (
        <section className="rounded-2xl border border-border-subtle bg-surface p-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated text-text-secondary">
            <MaewsaveMark size={36} decorative />
          </div>
          <div className="space-y-2">
            <h2 className="text-[18px] font-semibold text-text-primary">
              {t("emptyNoWalletsTitle")}
            </h2>
            <p className="text-[14px] text-text-secondary">
              {t("emptyNoWalletsDescription")}
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-accent px-5 text-[14px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85"
          >
            {t("goToSettings")}
          </Link>
        </section>
      ) : groupedByDate.length === 0 ? (
        <section className="rounded-2xl border border-border-subtle bg-surface p-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated text-text-secondary">
            <MaewsaveMark size={36} decorative />
          </div>
          <div className="space-y-2">
            <h2 className="text-[18px] font-semibold text-text-primary">
              {hasActiveFilters
                ? t("emptyFilteredTitle")
                : t("emptyMonthTitle")}
            </h2>
            <p className="text-[14px] text-text-secondary">
              {hasActiveFilters
                ? t("emptyFilteredDescription")
                : t("emptyMonthDescription")}
            </p>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setTypeFilter("ALL");
                setWalletFilter("ALL");
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-elevated px-5 text-[14px] font-semibold text-text-primary"
            >
              {t("clearFilters")}
            </button>
          ) : (
            <button
              type="button"
              onClick={openCreateSheet}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-accent px-5 text-[14px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85"
            >
              {t("addFirstTransaction")}
            </button>
          )}
        </section>
      ) : (
        <div className="space-y-3">
          {groupedByDate.map((group) => (
            <section
              key={group.date}
              className="rounded-2xl border border-border-subtle bg-surface overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-elevated px-4 py-3">
                <h2 className="text-[13px] font-semibold tabular-nums text-text-secondary">
                  {formatShortTransactionDate(group.date, locale)}
                </h2>
                {group.dailyExpenseSatang > 0 && (
                  <span className="text-[13px] font-medium tabular-nums text-text-secondary">
                    -{formatSatang(group.dailyExpenseSatang)}
                  </span>
                )}
              </div>

              <ul className="divide-y divide-border-subtle">
                {group.items.map((tx) => {
                  const wallet = walletMap.get(tx.walletId);
                  const toWallet = tx.toWalletId
                    ? walletMap.get(tx.toWalletId)
                    : undefined;
                  const category = tx.categoryId
                    ? categoryMap.get(tx.categoryId)
                    : undefined;

                  const subtitle =
                    tx.type === "TRANSFER"
                      ? t("transferPair", {
                          from: wallet?.alias ?? "—",
                          to: toWallet?.alias ?? "—",
                        })
                      : [wallet?.alias, category?.name]
                          .filter(Boolean)
                          .join(" · ");

                  const amountColorClass =
                    tx.type === "INCOME"
                      ? "text-status-income"
                      : tx.type === "EXPENSE"
                        ? "text-status-expense"
                        : "text-status-transfer";

                  const formattedAmount =
                    tx.type === "INCOME"
                      ? `+${formatSatang(tx.amountSatang)}`
                      : tx.type === "EXPENSE"
                        ? `-${formatSatang(tx.amountSatang)}`
                        : formatSatang(tx.amountSatang);

                  return (
                    <li key={tx.id}>
                      <button
                        type="button"
                        onClick={() => openEditSheet(tx)}
                        className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated active:bg-elevated"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-elevated ${amountColorClass}`}
                          >
                            {tx.type === "TRANSFER" ? (
                              <ArrowLeftRight
                                className="h-5 w-5"
                                aria-hidden="true"
                              />
                            ) : (
                              <CategoryIcon
                                icon={category?.icon}
                                className="h-5 w-5"
                              />
                            )}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-[15px] font-medium text-text-primary">
                              {tx.merchant}
                            </p>
                            <p className="truncate text-[13px] text-text-secondary">
                              {subtitle}
                              {tx.note ? ` · ${tx.note}` : ""}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 text-[15px] font-semibold tabular-nums ${amountColorClass}`}
                        >
                          {formattedAmount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-30 mx-auto max-w-[448px] px-4"
        >
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-border-subtle bg-elevated px-4 py-2">
            <span className="text-[14px] font-medium text-text-primary">
              {toast.message}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {toast.canEdit && toast.transaction && (
                <button
                  type="button"
                  onClick={() => {
                    const target = toast.transaction;
                    setToast(null);
                    if (target) {
                      openEditSheet(target);
                    }
                  }}
                  className="min-h-11 min-w-11 rounded-xl px-3 text-[13px] font-semibold text-brand-accent"
                >
                  {tCommon("edit")}
                </button>
              )}
              {toast.canUndo && toast.transaction && (
                <button
                  type="button"
                  onClick={() => void handleToastUndo()}
                  className="min-h-11 min-w-11 rounded-xl px-3 text-[13px] font-semibold text-status-expense"
                >
                  {tCommon("undo")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <TransactionSheet
        key={sheetKey}
        open={sheetOpen}
        editingTransaction={editingTx}
        wallets={overview.wallets}
        categories={overview.categories}
        defaultDateIso={overview.referenceDateIso}
        onClose={() => setSheetOpen(false)}
        onSave={handleSaveTransaction}
        onDelete={handleDeleteTransaction}
      />
    </div>
  );
}
