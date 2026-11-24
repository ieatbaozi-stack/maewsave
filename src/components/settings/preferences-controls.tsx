"use client";

import { AlertCircle, Globe, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore, useTransition } from "react";
import { setLocaleAction } from "@/app/actions/locale";
import type { AppLocale } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";

const emptySubscribe = () => () => {};

function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

interface PreferencesControlsProps {
  showSignOut?: boolean;
}

export function PreferencesControls({ showSignOut = false }: PreferencesControlsProps) {
  const tSettings = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isHydrated = useIsHydrated();
  const [isLocalePending, startLocaleTransition] = useTransition();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);

  const activeTheme = isHydrated ? (theme ?? "system") : "system";

  function handleLocaleChange(nextLocale: AppLocale) {
    if (nextLocale === locale || isLocalePending) {
      return;
    }

    setHasActionError(false);
    startLocaleTransition(async () => {
      try {
        const result = await setLocaleAction(nextLocale);
        if (!result.ok) {
          setHasActionError(true);
          return;
        }
        router.refresh();
      } catch {
        setHasActionError(true);
      }
    });
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setHasActionError(false);
    try {
      const result = await authClient.signOut();
      if (result?.error) {
        setHasActionError(true);
        return;
      }
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setHasActionError(true);
    } finally {
      setIsSigningOut(false);
    }
  }

  const themeOptions = [
    { value: "system", label: tSettings("themeSystem"), icon: Monitor },
    { value: "light", label: tSettings("themeLight"), icon: Sun },
    { value: "dark", label: tSettings("themeDark"), icon: Moon },
  ] as const;

  const localeOptions: ReadonlyArray<{ value: AppLocale; label: string }> = [
    { value: "th", label: tSettings("languageTh") },
    { value: "en", label: tSettings("languageEn") },
  ];

  return (
    <div className="space-y-4">
      {hasActionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-border-subtle bg-elevated p-3 text-[14px] text-status-expense"
        >
          <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{tCommon("errorDescription")}</span>
        </div>
      )}

      <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
          {tSettings("appearanceSection")}
        </h2>

        <div className="space-y-2">
          <p className="text-[14px] font-medium text-text-primary">
            {tSettings("themeLabel")}
          </p>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-elevated p-1">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = activeTheme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setTheme(option.value)}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-[13px] font-medium transition-colors ${
                    isSelected
                      ? "bg-brand-accent text-brand-accent-fg"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-[14px] font-medium text-text-primary">
            <Globe className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            <span>{tSettings("languageLabel")}</span>
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-elevated p-1">
            {localeOptions.map((option) => {
              const isSelected = locale === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isLocalePending}
                  aria-pressed={isSelected}
                  onClick={() => handleLocaleChange(option.value)}
                  className={`inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-[14px] font-medium transition-colors disabled:opacity-60 ${
                    isSelected
                      ? "bg-brand-accent text-brand-accent-fg"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {showSignOut && (
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface px-4 text-[15px] font-medium text-status-expense transition-colors hover:bg-elevated disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>{isSigningOut ? tAuth("signingOut") : tAuth("signOut")}</span>
        </button>
      )}
    </div>
  );
}
