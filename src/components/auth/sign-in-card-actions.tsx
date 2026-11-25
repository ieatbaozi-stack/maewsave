"use client";

import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, KeyRound, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type AuthErrorState =
  | {
      key:
        | "inviteRequiredError"
        | "invalidInviteError"
        | "invalidOtpError"
        | "otpDailyCapError"
        | "otpDeliveryUnavailableError"
        | "genericError";
    }
  | {
      key: "rateLimitedError";
      seconds: number;
    };

interface SignInCardActionsProps {
  initialErrorCode?: string;
}

function extractInviteCodeFromHash(hash: string): string | null {
  const cleaned = hash.replace(/^#/, "").trim();
  if (!cleaned) {
    return null;
  }
  const params = new URLSearchParams(cleaned);
  const raw = params.get("invite")?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function classifyQueryErrorCode(code: string | undefined): AuthErrorState | null {
  if (!code) {
    return null;
  }
  const normalized = code.toLowerCase();
  if (normalized.includes("invite_required") || normalized.includes("forbidden")) {
    return { key: "inviteRequiredError" };
  }
  return { key: "genericError" };
}

export function SignInCardActions({ initialErrorCode }: SignInCardActionsProps) {
  const t = useTranslations("auth");

  const [isGooglePending, setIsGooglePending] = useState(false);
  const [errorState, setErrorState] = useState<AuthErrorState | null>(() =>
    classifyQueryErrorCode(initialErrorCode),
  );

  // Invitation code state (for new users)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [isCheckingInvite, setIsCheckingInvite] = useState(false);
  const [inviteVerified, setInviteVerified] = useState(false);

  // Survives React 19 Strict Mode double-mount after stripping #invite= from window.location.hash
  const pendingHashInviteRef = useRef<string | null>(null);

  // Email OTP state
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const verifyInviteCode = useCallback(
    async (rawCode: string, signal?: AbortSignal) => {
      const trimmed = rawCode.trim();
      if (!trimmed) {
        return;
      }

      setIsCheckingInvite(true);
      setErrorState(null);

      try {
        const res = await fetch("/api/invite/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed }),
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        if (res.ok) {
          setInviteVerified(true);
          setInviteOpen(true);
          return;
        }

        if (res.status === 429) {
          const retryHeader = Number(res.headers.get("X-Retry-After") ?? "60");
          setErrorState({
            key: "rateLimitedError",
            seconds: Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 60,
          });
          return;
        }

        setInviteVerified(false);
        setErrorState({ key: "invalidInviteError" });
      } catch {
        if (!signal?.aborted) {
          setErrorState({ key: "genericError" });
        }
      } finally {
        if (!signal?.aborted) {
          setIsCheckingInvite(false);
        }
      }
    },
    [],
  );

  // Read #invite=XXXX-XXXX from URL hash fragment, immediately strip it from history, and verify
  useEffect(() => {
    const hashInvite = extractInviteCodeFromHash(window.location.hash);
    if (hashInvite) {
      pendingHashInviteRef.current = hashInvite;
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", cleanUrl);
    }

    const codeToVerify = pendingHashInviteRef.current;
    if (!codeToVerify) {
      return;
    }

    const controller = new AbortController();

    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) {
        return;
      }
      setInviteInput(codeToVerify);
      setInviteOpen(true);
      await verifyInviteCode(codeToVerify, controller.signal);
      if (!controller.signal.aborted) {
        pendingHashInviteRef.current = null;
      }
    });

    return () => {
      controller.abort();
    };
  }, [verifyInviteCode]);

  // Stable countdown interval for OTP resend (does not recreate on every second)
  const isCoolingDown = resendSeconds > 0;
  useEffect(() => {
    if (!isCoolingDown) {
      return;
    }
    const timer = window.setInterval(() => {
      setResendSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isCoolingDown]);

  async function handleGoogleSignIn() {
    if (isCheckingInvite || isGooglePending) {
      return;
    }
    setIsGooglePending(true);
    setErrorState(null);

    try {
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/sign-in",
      });

      if (response?.error) {
        const errorCode =
          typeof response.error.code === "string"
            ? response.error.code
            : response.error.message;
        const normalized = (errorCode ?? "").toLowerCase();
        if (
          response.error.status === 403 ||
          normalized.includes("invite") ||
          normalized.includes("forbidden")
        ) {
          setErrorState({ key: "inviteRequiredError" });
        } else {
          setErrorState({ key: "genericError" });
        }
        setIsGooglePending(false);
      }
    } catch {
      setErrorState({ key: "genericError" });
      setIsGooglePending(false);
    }
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await verifyInviteCode(inviteInput);
  }

  async function requestOtp() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || isRequestingOtp || isCheckingInvite) {
      return;
    }

    setIsRequestingOtp(true);
    setErrorState(null);

    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (res.ok) {
        const data = (await res.json()) as { retryAfterSec?: number };
        setOtpSent(true);
        setOtpCode("");
        setResendSeconds(data.retryAfterSec ?? 60);
        return;
      }

      if (res.status === 429) {
        const retryHeader = Number(res.headers.get("X-Retry-After") ?? "60");
        const seconds = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 60;
        setResendSeconds(seconds);
        setErrorState({ key: "rateLimitedError", seconds });
        return;
      }

      if (res.status === 503) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (payload.error === "OTP_DELIVERY_UNAVAILABLE") {
          setErrorState({ key: "otpDeliveryUnavailableError" });
        } else {
          setErrorState({ key: "otpDailyCapError" });
        }
        return;
      }

      setErrorState({ key: "genericError" });
    } catch {
      setErrorState({ key: "genericError" });
    } finally {
      setIsRequestingOtp(false);
    }
  }

  async function handleOtpRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestOtp();
  }

  async function handleOtpVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isVerifyingOtp || isCheckingInvite) {
      return;
    }
    const cleanedOtp = otpCode.replace(/\D/g, "").slice(0, 6);
    if (cleanedOtp.length !== 6) {
      setErrorState({ key: "invalidOtpError" });
      return;
    }

    setIsVerifyingOtp(true);
    setErrorState(null);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: cleanedOtp }),
      });

      if (res.ok) {
        window.location.replace("/");
        return;
      }

      if (res.status === 429) {
        const retryHeader = Number(res.headers.get("X-Retry-After") ?? "60");
        setErrorState({
          key: "rateLimitedError",
          seconds: Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 60,
        });
        return;
      }

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      const code = (payload.error ?? payload.code ?? "").toUpperCase();

      if (code === "INVITE_REQUIRED" || res.status === 403) {
        setErrorState({ key: "inviteRequiredError" });
      } else if (code === "INVALID_OTP" || res.status === 400) {
        setErrorState({ key: "invalidOtpError" });
      } else {
        setErrorState({ key: "genericError" });
      }
    } catch {
      setErrorState({ key: "genericError" });
    } finally {
      setIsVerifyingOtp(false);
    }
  }

  function renderErrorText(err: AuthErrorState): string {
    if (err.key === "rateLimitedError") {
      return t("rateLimitedError", { seconds: err.seconds });
    }
    return t(err.key);
  }

  return (
    <div className="space-y-4">
      {errorState && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-border-subtle bg-elevated p-3 text-[14px] text-status-expense"
        >
          <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{renderErrorText(errorState)}</span>
        </div>
      )}

      {inviteVerified && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-border-subtle bg-elevated p-3 text-[14px] text-status-income"
        >
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("inviteVerifiedBadge")}</span>
        </div>
      )}

      <button
        type="button"
        disabled={isGooglePending || isCheckingInvite}
        onClick={handleGoogleSignIn}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-accent px-4 text-[15px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85 disabled:opacity-60"
      >
        {isGooglePending ? t("signingIn") : t("continueWithGoogle")}
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border-subtle" />
        <span className="text-[13px] text-text-secondary">{t("orEmailDivider")}</span>
        <div className="h-px flex-1 bg-border-subtle" />
      </div>

      {!otpSent ? (
        <form onSubmit={handleOtpRequestSubmit} className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="signin-email"
              className="block text-[14px] font-medium text-text-primary"
            >
              {t("emailLabel")}
            </label>
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("emailPlaceholder")}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-3 text-base text-text-primary placeholder:text-text-muted"
            />
          </div>

          <button
            type="submit"
            disabled={isRequestingOtp || isCheckingInvite}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-subtle bg-elevated px-4 text-[15px] font-medium text-text-primary transition-colors hover:bg-surface disabled:opacity-60"
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{isRequestingOtp ? t("sendingOtp") : t("sendOtpButton")}</span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleOtpVerifySubmit} className="space-y-3">
          <div className="rounded-xl border border-border-subtle bg-elevated p-3 space-y-1 text-[13px] text-text-secondary">
            <p className="text-text-primary font-medium">{t("otpSentNotice")}</p>
            <p>{t("spamFolderHint")}</p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="signin-otp"
              className="block text-[14px] font-medium text-text-primary"
            >
              {t("otpCodeLabel")}
            </label>
            <input
              id="signin-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={otpCode}
              onChange={(event) =>
                setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder={t("otpCodePlaceholder")}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-3 text-center text-base font-semibold tracking-[0.25em] tabular-nums text-text-primary placeholder:text-text-muted"
            />
          </div>

          <button
            type="submit"
            disabled={isVerifyingOtp || isCheckingInvite || otpCode.length !== 6}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-accent px-4 text-[15px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85 disabled:opacity-60"
          >
            {isVerifyingOtp ? t("verifyingOtp") : t("verifyOtpButton")}
          </button>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={resendSeconds > 0 || isRequestingOtp || isCheckingInvite}
              onClick={() => void requestOtp()}
              className="min-h-11 rounded-xl px-2 text-[13px] font-medium text-brand-accent tabular-nums disabled:text-text-muted"
            >
              {resendSeconds > 0
                ? t("resendCountdown", { seconds: resendSeconds })
                : t("resendOtpButton")}
            </button>

            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setOtpCode("");
                setErrorState(null);
              }}
              className="min-h-11 rounded-xl px-2 text-[13px] font-medium text-text-secondary hover:text-text-primary"
            >
              {t("changeEmailButton")}
            </button>
          </div>
        </form>
      )}

      <div className="border-t border-border-subtle pt-3">
        <button
          type="button"
          aria-expanded={inviteOpen}
          onClick={() => setInviteOpen((prev) => !prev)}
          className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-[14px] font-medium text-text-secondary hover:text-text-primary"
        >
          <span className="inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("inviteSectionToggle")}</span>
          </span>
          {inviteOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </button>

        {inviteOpen && (
          <form onSubmit={handleInviteSubmit} className="mt-3 space-y-2">
            <label
              htmlFor="signin-invite-code"
              className="block text-[13px] font-medium text-text-secondary"
            >
              {t("inviteCodeLabel")}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="signin-invite-code"
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={12}
                value={inviteInput}
                onChange={(event) => {
                  setInviteInput(event.target.value.toUpperCase());
                  if (inviteVerified) {
                    setInviteVerified(false);
                  }
                }}
                placeholder={t("inviteCodePlaceholder")}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-border-subtle bg-elevated px-3 text-base font-medium tracking-wider tabular-nums text-text-primary placeholder:text-text-muted"
              />
              <button
                type="submit"
                disabled={isCheckingInvite || inviteInput.trim().length < 8}
                className="min-h-12 shrink-0 rounded-xl border border-border-subtle bg-elevated px-4 text-[14px] font-medium text-text-primary transition-colors hover:bg-surface disabled:opacity-60"
              >
                {isCheckingInvite ? t("checkingInvite") : t("applyInviteButton")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
