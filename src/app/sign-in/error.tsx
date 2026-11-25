"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface SignInErrorProps {
  reset: () => void;
}

export default function SignInError({ reset }: SignInErrorProps) {
  const t = useTranslations("common");

  return (
    <main className="min-h-dvh bg-canvas px-4 pt-safe pb-safe flex flex-col justify-center">
      <div className="mx-auto w-full max-w-[420px] py-8">
        <section
          role="alert"
          className="rounded-2xl border border-border-subtle bg-surface p-6 text-center space-y-4"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-elevated text-status-expense">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-[18px] font-semibold text-text-primary">{t("errorTitle")}</h1>
            <p className="text-[14px] text-text-secondary">{t("errorDescription")}</p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-accent px-5 text-[14px] font-semibold text-brand-accent-fg"
          >
            {t("retry")}
          </button>
        </section>
      </div>
    </main>
  );
}
