"use client";

import { CalendarClock, Plus, Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { MaewsaveMark } from "@/components/brand/maewsave-mark";

export const QUICK_ADD_EVENT = "maewsave:open-quick-add";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const tBrand = useTranslations("brand");
  const tNav = useTranslations("nav");

  const isLedger = pathname === "/";
  const isBills = pathname.startsWith("/bills");
  const isSettings = pathname.startsWith("/settings");

  function handleQuickAddClick() {
    if (isLedger) {
      window.dispatchEvent(new CustomEvent(QUICK_ADD_EVENT));
      return;
    }
    router.push("/?compose=1");
  }

  return (
    <div className="min-h-dvh bg-canvas text-text-primary flex flex-col">
      <header className="sticky top-0 z-20 bg-surface border-b border-border-subtle pt-safe">
        <div className="mx-auto flex h-14 max-w-[480px] items-center justify-between px-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-text-primary rounded-xl"
          >
            <MaewsaveMark size={28} className="text-brand-accent shrink-0" decorative />
            <span className="text-[17px] font-semibold tracking-tight">{tBrand("name")}</span>
          </Link>

          <Link
            href="/settings"
            aria-label={tNav("settings")}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
              isSettings
                ? "bg-elevated text-brand-accent"
                : "text-text-secondary hover:bg-elevated hover:text-text-primary"
            }`}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>

      <nav
        aria-label={tNav("primaryNav")}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface pb-safe"
      >
        <div className="mx-auto grid h-16 max-w-[480px] grid-cols-3 items-center px-4">
          <Link
            href="/"
            aria-current={isLedger ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[12px] font-medium transition-colors ${
              isLedger ? "text-brand-accent" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Wallet className="h-5 w-5" aria-hidden="true" />
            <span>{tNav("ledger")}</span>
          </Link>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleQuickAddClick}
              aria-label={tNav("quickAdd")}
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-accent text-brand-accent-fg transition-opacity active:opacity-85"
            >
              <Plus className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <Link
            href="/bills"
            aria-current={isBills ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[12px] font-medium transition-colors ${
              isBills ? "text-brand-accent" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
            <span>{tNav("bills")}</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
