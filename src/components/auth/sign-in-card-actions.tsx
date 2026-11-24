"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type AuthErrorKey = "unauthorizedError" | "genericError";

interface SignInCardActionsProps {
  initialErrorCode?: string;
}

function classifyErrorCode(code: string | undefined, status?: number): AuthErrorKey {
  if (status === 403 || status === 401) {
    return "unauthorizedError";
  }
  const normalized = (code ?? "").toLowerCase();
  if (
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized") ||
    normalized.includes("access_denied")
  ) {
    return "unauthorizedError";
  }
  return "genericError";
}

export function SignInCardActions({ initialErrorCode }: SignInCardActionsProps) {
  const t = useTranslations("auth");
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(() =>
    initialErrorCode ? classifyErrorCode(initialErrorCode) : null,
  );

  async function handleGoogleSignIn() {
    setIsPending(true);
    setErrorKey(null);

    try {
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/auth/complete",
        errorCallbackURL: "/sign-in",
      });

      if (response?.error) {
        const errorCode =
          typeof response.error.code === "string"
            ? response.error.code
            : response.error.message;
        setErrorKey(classifyErrorCode(errorCode, response.error.status));
        setIsPending(false);
      }
    } catch {
      setErrorKey("genericError");
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {errorKey && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-border-subtle bg-elevated p-3 text-[14px] text-status-expense"
        >
          <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(errorKey)}</span>
        </div>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={handleGoogleSignIn}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-accent px-4 text-[15px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85 disabled:opacity-60"
      >
        {isPending ? t("signingIn") : t("continueWithGoogle")}
      </button>
    </div>
  );
}
