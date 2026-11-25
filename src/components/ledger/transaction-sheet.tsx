"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { TransactionType } from "@/db/finance-schema";
import { isValidIsoDate } from "@/domain/billing-cycle";
import type {
  SerializedCategory,
  SerializedTransaction,
  SerializedWallet,
} from "@/domain/ledger-types";
import { parseBahtToSatang, satangToInputString } from "@/domain/money";
import type { TransactionPayloadInput } from "@/lib/validation/finance";

interface TransactionSheetProps {
  open: boolean;
  editingTransaction: SerializedTransaction | null;
  wallets: SerializedWallet[];
  categories: SerializedCategory[];
  defaultDateIso: string;
  onClose: () => void;
  onSave: (
    payload: TransactionPayloadInput,
    editingId: string | null,
  ) => Promise<void>;
  onDelete: (transaction: SerializedTransaction) => Promise<void>;
}

export function TransactionSheet({
  open,
  editingTransaction,
  wallets,
  categories,
  defaultDateIso,
  onClose,
  onSave,
  onDelete,
}: TransactionSheetProps) {
  const t = useTranslations("ledger");
  const tCommon = useTranslations("common");

  const activeWallets = wallets.filter((w) => w.isActive);

  // Archived wallets remain selectable ONLY in the exact slot they already occupied on this edit
  const sourceWallets = editingTransaction
    ? wallets.filter((w) => w.isActive || w.id === editingTransaction.walletId)
    : activeWallets;

  const allowedDestinationPool = editingTransaction
    ? wallets.filter((w) => w.isActive || w.id === editingTransaction.toWalletId)
    : activeWallets;

  const defaultWalletId = sourceWallets[0]?.id ?? "";
  const defaultToWalletId =
    allowedDestinationPool.find((w) => w.id !== defaultWalletId)?.id ?? "";

  const [type, setType] = useState<TransactionType>(
    editingTransaction?.type ?? "EXPENSE",
  );
  const [amountInput, setAmountInput] = useState(
    editingTransaction
      ? satangToInputString(editingTransaction.amountSatang)
      : "",
  );
  const [merchant, setMerchant] = useState(editingTransaction?.merchant ?? "");
  const [walletId, setWalletId] = useState(
    editingTransaction?.walletId ?? defaultWalletId,
  );
  const [toWalletId, setToWalletId] = useState(
    editingTransaction?.toWalletId ?? defaultToWalletId,
  );
  const [categoryId, setCategoryId] = useState(
    editingTransaction?.categoryId ?? "",
  );
  const [transactionDate, setTransactionDate] = useState(
    editingTransaction?.transactionDate ?? defaultDateIso,
  );
  const [note, setNote] = useState(editingTransaction?.note ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredCategories = categories.filter((c) => c.type === type);
  const destinationWallets = allowedDestinationPool.filter(
    (w) => w.id !== walletId,
  );
  const canTransfer =
    sourceWallets.length >= 1 && destinationWallets.length >= 1;

  function handleTypeSwitch(nextType: TransactionType) {
    setType(nextType);
    setFormError(null);
    if (nextType === "TRANSFER") {
      setCategoryId("");
      const validDestinations = allowedDestinationPool.filter(
        (w) => w.id !== walletId,
      );
      if (!validDestinations.some((w) => w.id === toWalletId)) {
        setToWalletId(validDestinations[0]?.id ?? "");
      }
    } else {
      const currentCategoryStillValid = categories.some(
        (c) => c.id === categoryId && c.type === nextType,
      );
      if (!currentCategoryStillValid) {
        setCategoryId("");
      }
    }
  }

  function handleWalletChange(nextWalletId: string) {
    setWalletId(nextWalletId);
    if (type === "TRANSFER" && toWalletId === nextWalletId) {
      const alt = allowedDestinationPool.find((w) => w.id !== nextWalletId);
      setToWalletId(alt?.id ?? "");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const amountSatang = parseBahtToSatang(amountInput);
    if (amountSatang === null || amountSatang <= 0) {
      setFormError(t("invalidAmountError"));
      return;
    }

    const trimmedMerchant = merchant.trim();
    if (trimmedMerchant.length === 0 || trimmedMerchant.length > 120) {
      setFormError(t("invalidMerchantError"));
      return;
    }

    if (!walletId) {
      setFormError(t("invalidWalletError"));
      return;
    }

    if (type === "TRANSFER" && (!toWalletId || toWalletId === walletId)) {
      setFormError(t("invalidTransferWalletError"));
      return;
    }

    if (!isValidIsoDate(transactionDate)) {
      setFormError(t("invalidDateError"));
      return;
    }

    const trimmedNote = note.trim();
    const payload: TransactionPayloadInput = {
      type,
      amountSatang,
      walletId,
      toWalletId: type === "TRANSFER" ? toWalletId : null,
      categoryId:
        type === "TRANSFER" || categoryId.length === 0 ? null : categoryId,
      merchant: trimmedMerchant,
      note: trimmedNote.length > 0 ? trimmedNote : null,
      transactionDate,
    };

    setIsSubmitting(true);
    setFormError(null);
    try {
      await onSave(payload, editingTransaction?.id ?? null);
    } catch {
      setFormError(t("actionError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!editingTransaction || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      await onDelete(editingTransaction);
    } catch {
      setFormError(t("actionError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={isSubmitting ? () => undefined : onClose}
      title={editingTransaction ? t("editTitle") : t("createTitle")}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((optionType) => {
            const selected = type === optionType;
            const label =
              optionType === "EXPENSE"
                ? t("typeExpense")
                : optionType === "INCOME"
                  ? t("typeIncome")
                  : t("typeTransfer");
            return (
              <button
                key={optionType}
                type="button"
                aria-pressed={selected}
                onClick={() => handleTypeSwitch(optionType)}
                className={`min-h-11 rounded-xl px-2 text-[13px] font-semibold transition-colors ${
                  selected
                    ? "bg-brand-accent text-brand-accent-fg"
                    : "bg-elevated text-text-secondary hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-status-expense bg-elevated px-4 py-3 text-[13px] text-status-expense"
          >
            {formError}
          </div>
        )}

        {type === "TRANSFER" && !canTransfer && (
          <div className="rounded-xl bg-elevated px-4 py-3 text-[13px] text-status-warning">
            {t("needTwoWalletsHint")}
          </div>
        )}

        <div className="space-y-2">
          <label
            htmlFor="tx-amount"
            className="block text-[13px] font-medium text-text-secondary"
          >
            {t("amountLabel")}
          </label>
          <input
            id="tx-amount"
            type="text"
            inputMode="decimal"
            required
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            placeholder={t("amountPlaceholder")}
            className="min-h-14 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-[24px] font-bold tabular-nums text-text-primary placeholder:text-text-muted"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="tx-merchant"
            className="block text-[13px] font-medium text-text-secondary"
          >
            {t("merchantLabel")}
          </label>
          <input
            id="tx-merchant"
            type="text"
            maxLength={120}
            required
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder={
              type === "TRANSFER"
                ? t("merchantTransferPlaceholder")
                : t("merchantPlaceholder")
            }
            className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base text-text-primary placeholder:text-text-muted"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="tx-wallet"
            className="block text-[13px] font-medium text-text-secondary"
          >
            {type === "TRANSFER" ? t("fromWalletLabel") : t("walletLabel")}
          </label>
          <select
            id="tx-wallet"
            value={walletId}
            onChange={(event) => handleWalletChange(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base text-text-primary"
          >
            {sourceWallets.length === 0 ? (
              <option value="">{t("selectWalletPlaceholder")}</option>
            ) : (
              sourceWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.alias}
                </option>
              ))
            )}
          </select>
        </div>

        {type === "TRANSFER" ? (
          <div className="space-y-2">
            <label
              htmlFor="tx-to-wallet"
              className="block text-[13px] font-medium text-text-secondary"
            >
              {t("toWalletLabel")}
            </label>
            <select
              id="tx-to-wallet"
              value={toWalletId}
              onChange={(event) => setToWalletId(event.target.value)}
              disabled={!canTransfer}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base text-text-primary disabled:opacity-60"
            >
              {destinationWallets.length === 0 ? (
                <option value="">{t("selectWalletPlaceholder")}</option>
              ) : (
                destinationWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.alias}
                  </option>
                ))
              )}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor="tx-category"
              className="block text-[13px] font-medium text-text-secondary"
            >
              {t("categoryLabel")}
            </label>
            <select
              id="tx-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base text-text-primary"
            >
              <option value="">{t("noCategoryOption")}</option>
              {filteredCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="tx-date"
              className="block text-[13px] font-medium text-text-secondary"
            >
              {t("dateLabel")}
            </label>
            <input
              id="tx-date"
              type="date"
              required
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base tabular-nums text-text-primary"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="tx-note"
              className="block text-[13px] font-medium text-text-secondary"
            >
              {t("noteLabel")} ({tCommon("optional")})
            </label>
            <input
              id="tx-note"
              type="text"
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("notePlaceholder")}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base text-text-primary placeholder:text-text-muted"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={
            isSubmitting ||
            sourceWallets.length === 0 ||
            (type === "TRANSFER" && !canTransfer)
          }
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-accent px-4 text-[15px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85 disabled:opacity-60"
        >
          {isSubmitting ? tCommon("saving") : tCommon("save")}
        </button>

        {editingTransaction && (
          <div className="border-t border-border-subtle pt-4">
            {confirmingDelete ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmingDelete(false)}
                  className="min-h-11 rounded-xl bg-elevated px-3 text-[14px] font-medium text-text-secondary"
                >
                  {tCommon("cancel")}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmDelete}
                  className="min-h-11 rounded-xl border border-status-expense bg-surface px-3 text-[14px] font-semibold text-status-expense"
                >
                  {isSubmitting ? tCommon("deleting") : tCommon("confirmDelete")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setConfirmingDelete(true)}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-medium text-status-expense transition-colors hover:bg-elevated"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>{tCommon("delete")}</span>
              </button>
            )}
          </div>
        )}
      </form>
    </BottomSheet>
  );
}
