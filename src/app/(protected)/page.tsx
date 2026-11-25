import { getLocale } from "next-intl/server";
import { LedgerView } from "@/components/ledger/ledger-view";
import { getDb } from "@/db";
import { requireAuthorizedSessionOrRedirect } from "@/lib/auth-guard";
import { getLedgerOverview } from "@/services/transactions";

interface LedgerPageProps {
  searchParams: Promise<{ compose?: string | string[] }>;
}

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const session = await requireAuthorizedSessionOrRedirect();
  const [rawLocale, resolvedSearchParams, overview] = await Promise.all([
    getLocale(),
    searchParams,
    getLedgerOverview(getDb(), session.userId),
  ]);

  const locale: "th" | "en" = rawLocale === "en" ? "en" : "th";
  const composeParam = Array.isArray(resolvedSearchParams.compose)
    ? resolvedSearchParams.compose[0]
    : resolvedSearchParams.compose;

  return (
    <LedgerView
      initialOverview={overview}
      locale={locale}
      initialOpenCompose={composeParam === "1"}
    />
  );
}
