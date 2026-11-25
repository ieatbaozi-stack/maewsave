"use client";

import {
  Archive,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  RotateCcw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MaewsaveMark } from "@/components/brand/maewsave-mark";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { WalletType } from "@/db/finance-schema";
import type { SerializedWallet } from "@/domain/ledger-types";
import {
  formatSatang,
  parseBahtToSatang,
  satangToInputString,
} from "@/domain/money";

interface WalletsManagerProps {
  initialWallets: SerializedWallet[];
}

function WalletTypeIcon({ type }: { type: WalletType }) {
  switch (type) {
    case "CREDIT_CARD":
      return <CreditCard className="h-5 w-5" aria-hidden="true" />;
    case "EWALLET":
      return <Smartphone className="h-5 w-5" aria-hidden="true" />;
    default:
      return <Landmark className="h-5 w-5" aria-hidden="true" />;
  }
}

export function WalletsManager({ initialWallets }: WalletsManagerProps) {
  const router = useRouter();
  const t = useTranslations("wallets");
  const tCommon = useTranslations("common");

  const [wallets, setWallets] = useState<SerializedWallet[]>(initialWallets);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<SerializedWallet | null>(null);

  const [alias, setAlias] = useState("");
  const [type, setType] = useState<WalletType>("BANK_CASH");
  const [statementDayInput, setStatementDayInput] = useState("");
  const [dueDayInput, setDueDayInput] = useState("");
  const [initialBalanceInput, setInitialBalanceInput] = useState("0.00");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreateSheet() {
    setEditingWallet(null);
    setAlias("");
    setType("BANK_CASH");
    setStatementDayInput("");
    setDueDayInput("");
    setInitialBalanceInput("0.00");
    setConfirmingDelete(false);
    setFormError(null);
    setSheetOpen(true);
  }

  function openEditSheet(wallet: SerializedWallet) {
    setEditingWallet(wallet);
    setAlias(wallet.alias);
    setType(wallet.type);
    setStatementDayInput(
      wallet.statementDay !== null ? String(wallet.statementDay) : "",
    );
    setDueDayInput(wallet.dueDay !== null ? String(wallet.dueDay) : "");
    setInitialBalanceInput(satangToInputString(wallet.initialBalanceSatang));
    setConfirmingDelete(false);
    setFormError(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    if (isSubmitting) {
      return;
    }
    setSheetOpen(false);
    setConfirmingDelete(false);
    setFormError(null);
  }

  function parseOptionalDay(raw: string): { ok: true; value: number | null } | { ok: false } {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return { ok: true, value: null };
    }
    if (!/^\d{1,2}$/.test(trimmed)) {
      return { ok: false };
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (parsed < 1 || parsed > 31) {
      return { ok: false };
    }
    return { ok: true, value: parsed };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmedAlias = alias.trim();
    if (trimmedAlias.length === 0 || trimmedAlias.length > 50) {
      setFormError(t("invalidAliasError"));
      return;
    }

    let statementDay: number | null = null;
    let dueDay: number | null = null;
    if (type === "CREDIT_CARD") {
      const stmtCheck = parseOptionalDay(statementDayInput);
      const dueCheck = parseOptionalDay(dueDayInput);
      if (!stmtCheck.ok || !dueCheck.ok) {
        setFormError(t("invalidDayError"));
        return;
      }
      statementDay = stmtCheck.value;
      dueDay = dueCheck.value;
    }

    const trimmedBalance = initialBalanceInput.trim();
    const initialBalanceSatang =
      trimmedBalance.length === 0
        ? 0
        : parseBahtToSatang(trimmedBalance, {
            allowZero: true,
            allowNegative: true,
          });
    if (initialBalanceSatang === null) {
      setFormError(t("invalidAmountError"));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        alias: trimmedAlias,
        type,
        statementDay,
        dueDay,
        initialBalanceSatang,
      };

      const url = editingWallet
        ? `/api/wallets/${editingWallet.id}`
        : "/api/wallets";
      const method = editingWallet ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setFormError(t("actionError"));
        return;
      }

      const data = (await res.json()) as { wallet: SerializedWallet };
      if (editingWallet) {
        setWallets((prev) =>
          prev.map((item) => (item.id === data.wallet.id ? data.wallet : item)),
        );
      } else {
        setWallets((prev) => [data.wallet, ...prev]);
      }

      setSheetOpen(false);
      router.refresh();
    } catch {
      setFormError(t("actionError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleActive(wallet: SerializedWallet) {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/wallets/${wallet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !wallet.isActive }),
      });

      if (!res.ok) {
        setFormError(t("actionError"));
        return;
      }

      const data = (await res.json()) as { wallet: SerializedWallet };
      setWallets((prev) =>
        prev.map((item) => (item.id === data.wallet.id ? data.wallet : item)),
      );
      setSheetOpen(false);
      router.refresh();
    } catch {
      setFormError(t("actionError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(wallet: SerializedWallet) {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/wallets/${wallet.id}`, {
        method: "DELETE",
      });

      if (res.status === 409) {
        setConfirmingDelete(false);
        setFormError(t("inUseError"));
        return;
      }

      if (!res.ok) {
        setFormError(t("actionError"));
        return;
      }

      setWallets((prev) => prev.filter((item) => item.id !== wallet.id));
      setSheetOpen(false);
      router.refresh();
    } catch {
      setFormError(t("actionError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function getTypeLabel(walletType: WalletType): string {
    switch (walletType) {
      case "CREDIT_CARD":
        return t("typeCreditCard");
      case "EWALLET":
        return t("typeEwallet");
      default:
        return t("typeBankCash");
    }
  }

  function getCycleMetadata(wallet: SerializedWallet): string | null {
    if (wallet.type !== "CREDIT_CARD") {
      return null;
    }
    if (wallet.statementDay !== null && wallet.dueDay !== null) {
      return t("cycleBadge", {
        statementDay: wallet.statementDay,
        dueDay: wallet.dueDay,
      });
    }
    if (wallet.statementDay !== null) {
      return t("statementOnlyBadge", { statementDay: wallet.statementDay });
    }
    if (wallet.dueDay !== null) {
      return t("dueOnlyBadge", { dueDay: wallet.dueDay });
    }
    return null;
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
          {t("sectionTitle")}
        </h2>
        <button
          type="button"
          onClick={openCreateSheet}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-accent px-4 text-[14px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t("addButton")}</span>
        </button>
      </div>

      {wallets.length === 0 ? (
        <div className="rounded-xl bg-elevated p-5 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-text-secondary">
            <MaewsaveMark size={28} decorative />
          </div>
          <div className="space-y-1">
            <p className="text-[15px] font-semibold text-text-primary">
              {t("emptyTitle")}
            </p>
            <p className="text-[13px] text-text-secondary">
              {t("emptyDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateSheet}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-accent px-4 text-[14px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85"
          >
            {t("addFirstButton")}
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {wallets.map((wallet) => {
            const cycleMeta = getCycleMetadata(wallet);
            return (
              <li
                key={wallet.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-elevated p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface ${
                      wallet.isActive ? "text-brand-accent" : "text-text-muted"
                    }`}
                  >
                    <WalletTypeIcon type={wallet.type} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-medium text-text-primary">
                        {wallet.alias}
                      </p>
                      {!wallet.isActive && (
                        <span className="rounded-lg bg-surface px-2 py-1 text-[11px] font-medium text-text-muted">
                          {t("archivedBadge")}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-text-secondary">
                      {getTypeLabel(wallet.type)}
                      {cycleMeta ? (
                        <span className="tabular-nums"> · {cycleMeta}</span>
                      ) : null}
                    </p>
                    {wallet.initialBalanceSatang !== 0 && (
                      <p className="text-[12px] text-text-muted tabular-nums">
                        {t("initialBalanceLabel")}:{" "}
                        {formatSatang(wallet.initialBalanceSatang)}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openEditSheet(wallet)}
                  aria-label={`${tCommon("edit")} ${wallet.alias}`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary transition-colors hover:text-text-primary"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={editingWallet ? t("editTitle") : t("createTitle")}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <p className="rounded-xl bg-elevated px-4 py-3 text-[13px] text-text-secondary">
            {t("privacyHint")}
          </p>

          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-status-expense bg-elevated px-4 py-3 text-[13px] text-status-expense"
            >
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="wallet-alias"
              className="block text-[13px] font-medium text-text-secondary"
            >
              {t("aliasLabel")}
            </label>
            <input
              id="wallet-alias"
              type="text"
              maxLength={50}
              required
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder={t("aliasPlaceholder")}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base text-text-primary placeholder:text-text-muted"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-[13px] font-medium text-text-secondary">
              {t("typeLabel")}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(["BANK_CASH", "CREDIT_CARD", "EWALLET"] as const).map(
                (optionType) => {
                  const selected = type === optionType;
                  return (
                    <button
                      key={optionType}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setType(optionType)}
                      className={`min-h-11 rounded-xl px-2 py-2 text-[13px] font-medium transition-colors ${
                        selected
                          ? "bg-brand-accent text-brand-accent-fg"
                          : "bg-elevated text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {getTypeLabel(optionType)}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {type === "CREDIT_CARD" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label
                  htmlFor="wallet-statement-day"
                  className="block text-[13px] font-medium text-text-secondary"
                >
                  {t("statementDayLabel")}
                </label>
                <input
                  id="wallet-statement-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={statementDayInput}
                  onChange={(event) => setStatementDayInput(event.target.value)}
                  placeholder={t("statementDayPlaceholder")}
                  className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base tabular-nums text-text-primary placeholder:text-text-muted"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="wallet-due-day"
                  className="block text-[13px] font-medium text-text-secondary"
                >
                  {t("dueDayLabel")}
                </label>
                <input
                  id="wallet-due-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={dueDayInput}
                  onChange={(event) => setDueDayInput(event.target.value)}
                  placeholder={t("dueDayPlaceholder")}
                  className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base tabular-nums text-text-primary placeholder:text-text-muted"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="wallet-initial-balance"
              className="block text-[13px] font-medium text-text-secondary"
            >
              {t("initialBalanceLabel")}
            </label>
            <input
              id="wallet-initial-balance"
              type="text"
              inputMode="decimal"
              value={initialBalanceInput}
              onChange={(event) => setInitialBalanceInput(event.target.value)}
              placeholder={t("initialBalancePlaceholder")}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base tabular-nums text-text-primary placeholder:text-text-muted"
            />
            {type === "CREDIT_CARD" && (
              <p className="text-[12px] text-text-muted">
                {t("initialBalanceCardHint")}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-accent px-4 text-[15px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85 disabled:opacity-60"
          >
            {isSubmitting ? tCommon("saving") : tCommon("save")}
          </button>

          {editingWallet && (
            <div className="space-y-2 border-t border-border-subtle pt-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleToggleActive(editingWallet)}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-elevated px-4 text-[14px] font-medium text-text-primary transition-opacity active:opacity-85 disabled:opacity-60"
              >
                {editingWallet.isActive ? (
                  <>
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    <span>{t("archiveButton")}</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span>{t("restoreButton")}</span>
                  </>
                )}
              </button>

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
                    onClick={() => handleDelete(editingWallet)}
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
    </section>
  );
}
