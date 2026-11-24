import { getTranslations } from "next-intl/server";

export default async function ProtectedLoading() {
  const t = await getTranslations("common");

  return (
    <div
      role="status"
      aria-busy="true"
      className="space-y-4 animate-pulse"
    >
      <span className="sr-only">{t("loading")}</span>
      <div className="h-28 rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
        <div className="h-4 w-28 rounded bg-elevated" />
        <div className="h-8 w-44 rounded bg-elevated" />
      </div>
      <div className="h-52 rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-elevated" />
        <div className="mx-auto h-4 w-40 rounded bg-elevated" />
        <div className="mx-auto h-4 w-60 rounded bg-elevated" />
      </div>
    </div>
  );
}
