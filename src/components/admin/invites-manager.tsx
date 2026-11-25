"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Share2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MaewsaveMark } from "@/components/brand/maewsave-mark";
import type { CreatedInvitationResult, InvitationSummary } from "@/services/invitations";

const EXPIRY_OPTIONS = [1, 3, 7, 14] as const;
const MAX_USES_OPTIONS = [1, 2, 3, 5, 10] as const;

interface InvitesManagerProps {
  initialInvites: InvitationSummary[];
}

function formatExpiryDate(isoDate: string, locale: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-ca-gregory" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function InvitesManager({ initialInvites }: InvitesManagerProps) {
  const t = useTranslations("adminInvites");
  const tBrand = useTranslations("brand");
  const locale = useLocale();

  const [invites, setInvites] = useState<InvitationSummary[]>(initialInvites);
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<(typeof EXPIRY_OPTIONS)[number]>(7);
  const [maxUses, setMaxUses] = useState<number>(1);
  const [isCreating, setIsCreating] = useState(false);
  const [createdOnce, setCreatedOnce] = useState<CreatedInvitationResult | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<"code" | "link" | null>(null);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<"rateLimitedError" | "actionError" | null>(null);

  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel || isCreating) {
      return;
    }

    setIsCreating(true);
    setErrorKey(null);

    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: trimmedLabel,
          expiresInDays,
          maxUses,
        }),
      });

      if (res.status === 429) {
        setErrorKey("rateLimitedError");
        return;
      }

      if (!res.ok) {
        setErrorKey("actionError");
        return;
      }

      const data = (await res.json()) as { invite: CreatedInvitationResult };
      setCreatedOnce(data.invite);
      setInvites((prev) => [
        {
          id: data.invite.id,
          label: data.invite.label,
          status: data.invite.status,
          usesCount: data.invite.usesCount,
          maxUses: data.invite.maxUses,
          expiresAt: data.invite.expiresAt,
          revokedAt: data.invite.revokedAt,
          createdAt: data.invite.createdAt,
        },
        ...prev,
      ]);
      setLabel("");
    } catch {
      setErrorKey("actionError");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCopy(text: string, target: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      setCopiedTarget(target);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedTarget(null);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      setErrorKey("actionError");
    }
  }

  async function handleShare(created: CreatedInvitationResult) {
    if (typeof navigator.share !== "function") {
      await handleCopy(created.inviteUrl, "link");
      return;
    }

    try {
      await navigator.share({
        title: tBrand("name"),
        text: created.code,
        url: created.inviteUrl,
      });
    } catch {
      // User dismissed native share sheet
    }
  }

  async function handleConfirmRevoke(id: string) {
    setRevokingId(id);
    setErrorKey(null);

    try {
      const res = await fetch(`/api/admin/invites/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
      });

      if (!res.ok) {
        setErrorKey("actionError");
        return;
      }

      const revokedAt = new Date().toISOString();
      setInvites((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "revoked", revokedAt } : item,
        ),
      );
      setCreatedOnce((prev) => (prev?.id === id ? null : prev));
      setPendingRevokeId(null);
    } catch {
      setErrorKey("actionError");
    } finally {
      setRevokingId(null);
    }
  }

  function statusStyle(status: InvitationSummary["status"]): string {
    switch (status) {
      case "active":
        return "text-status-income";
      case "exhausted":
        return "text-status-warning";
      case "expired":
        return "text-text-muted";
      case "revoked":
        return "text-status-expense";
    }
  }

  function statusText(status: InvitationSummary["status"]): string {
    switch (status) {
      case "active":
        return t("statusActive");
      case "exhausted":
        return t("statusExhausted");
      case "expired":
        return t("statusExpired");
      case "revoked":
        return t("statusRevoked");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-semibold text-text-primary">{t("pageTitle")}</h1>
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[14px] font-medium text-text-secondary hover:bg-elevated hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("backToSettings")}</span>
        </Link>
      </div>

      {errorKey && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-border-subtle bg-elevated p-3 text-[14px] text-status-expense"
        >
          <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(errorKey)}</span>
        </div>
      )}

      {createdOnce && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3"
        >
          <p className="text-[13px] font-medium text-status-warning">
            {t("oneTimeWarning")}
          </p>

          <div className="rounded-xl bg-elevated p-3 space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              {t("codeLabel")}
            </p>
            <p className="text-[24px] font-bold tracking-widest tabular-nums text-text-primary">
              {createdOnce.code}
            </p>
          </div>

          <div className="rounded-xl bg-elevated p-3 space-y-1">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              {t("linkLabel")}
            </p>
            <p className="text-[13px] text-text-primary break-all">
              {createdOnce.inviteUrl}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => void handleCopy(createdOnce.code, "code")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-accent px-3 text-[13px] font-semibold text-brand-accent-fg"
            >
              {copiedTarget === "code" ? (
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {copiedTarget === "code" ? t("copiedFeedback") : t("copyCodeButton")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopy(createdOnce.inviteUrl, "link")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-elevated px-3 text-[13px] font-medium text-text-primary"
            >
              {copiedTarget === "link" ? (
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {copiedTarget === "link" ? t("copiedFeedback") : t("copyLinkButton")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleShare(createdOnce)}
              className="col-span-2 sm:col-span-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-elevated px-3 text-[13px] font-medium text-text-primary"
            >
              <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("shareButton")}</span>
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
          {t("createSectionTitle")}
        </h2>

        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="invite-label"
              className="block text-[14px] font-medium text-text-primary"
            >
              {t("labelField")}
            </label>
            <input
              id="invite-label"
              type="text"
              required
              maxLength={100}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("labelPlaceholder")}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-3 text-base text-text-primary placeholder:text-text-muted"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[14px] font-medium text-text-primary">{t("expiryField")}</p>
            <div className="grid grid-cols-4 gap-2 rounded-xl bg-elevated p-1">
              {EXPIRY_OPTIONS.map((days) => {
                const isSelected = expiresInDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setExpiresInDays(days)}
                    className={`min-h-11 rounded-xl px-2 text-[14px] font-medium tabular-nums transition-colors ${
                      isSelected
                        ? "bg-brand-accent text-brand-accent-fg"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {t("expiryDaysOption", { days })}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="invite-max-uses"
              className="block text-[14px] font-medium text-text-primary"
            >
              {t("maxUsesField")}
            </label>
            <select
              id="invite-max-uses"
              value={maxUses}
              onChange={(event) => setMaxUses(Number(event.target.value))}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-3 text-base tabular-nums text-text-primary"
            >
              {MAX_USES_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isCreating || label.trim().length === 0}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 text-[15px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85 disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{isCreating ? t("creatingButton") : t("createButton")}</span>
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
          {t("listSectionTitle")}
        </h2>

        {invites.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-elevated text-text-secondary">
              <MaewsaveMark size={32} decorative />
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-medium text-text-primary">
                {t("emptyTitle")}
              </p>
              <p className="text-[13px] text-text-secondary">{t("emptyDescription")}</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {invites.map((invite) => {
              const isConfirming = pendingRevokeId === invite.id;
              const canRevoke = invite.status === "active";

              return (
                <li
                  key={invite.id}
                  className="rounded-xl border border-border-subtle bg-elevated p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] font-medium text-text-primary">
                      {invite.label}
                    </p>
                    <span
                      className={`shrink-0 text-[12px] font-semibold ${statusStyle(invite.status)}`}
                    >
                      {statusText(invite.status)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[13px] text-text-secondary tabular-nums">
                    <span>
                      {t("usageLabel")}: {invite.usesCount}/{invite.maxUses}
                    </span>
                    <span>
                      {t("expiresLabel")}: {formatExpiryDate(invite.expiresAt, locale)}
                    </span>
                  </div>

                  {canRevoke && (
                    <div className="pt-1">
                      {!isConfirming ? (
                        <button
                          type="button"
                          onClick={() => setPendingRevokeId(invite.id)}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 text-[13px] font-medium text-status-expense"
                        >
                          <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{t("revokeButton")}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={revokingId === invite.id}
                            onClick={() => void handleConfirmRevoke(invite.id)}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-status-expense px-3 text-[13px] font-semibold text-brand-accent-fg disabled:opacity-60"
                          >
                            {revokingId === invite.id
                              ? t("revokingButton")
                              : t("confirmRevokeButton")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingRevokeId(null)}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface px-3 text-[13px] font-medium text-text-secondary"
                          >
                            {t("cancelButton")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
