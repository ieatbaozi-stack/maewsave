import { getTranslations } from "next-intl/server";

export default async function AdminInvitesLoading() {
  const t = await getTranslations("common");

  return (
    <div role="status" aria-busy="true" className="space-y-4 animate-pulse">
      <span className="sr-only">{t("loading")}</span>
      <div className="h-8 w-44 rounded-xl bg-surface" />
      <div className="h-64 rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
        <div className="h-4 w-32 rounded bg-elevated" />
        <div className="h-12 w-full rounded-xl bg-elevated" />
        <div className="h-12 w-full rounded-xl bg-elevated" />
      </div>
    </div>
  );
}
