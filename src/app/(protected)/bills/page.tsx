import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MaewsaveMark } from "@/components/brand/maewsave-mark";
import { requireAuthorizedSessionOrRedirect } from "@/lib/auth-guard";

export default async function BillsPage() {
  await requireAuthorizedSessionOrRedirect();
  const t = await getTranslations("bills");

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold text-text-primary">{t("pageTitle")}</h1>

      <section className="rounded-2xl border border-border-subtle bg-surface p-6 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated text-text-secondary">
          <MaewsaveMark size={36} decorative />
        </div>
        <div className="space-y-2">
          <h2 className="text-[18px] font-semibold text-text-primary">
            {t("emptyTitle")}
          </h2>
          <p className="text-[14px] text-text-secondary">{t("emptyDescription")}</p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-accent px-5 text-[14px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85"
        >
          {t("goToLedger")}
        </Link>
      </section>
    </div>
  );
}
