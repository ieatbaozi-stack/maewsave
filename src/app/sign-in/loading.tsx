import { getTranslations } from "next-intl/server";

export default async function SignInLoading() {
  const t = await getTranslations("common");

  return (
    <main className="min-h-dvh bg-canvas px-4 pt-safe pb-safe flex flex-col justify-center">
      <div
        role="status"
        aria-busy="true"
        className="mx-auto w-full max-w-[420px] py-8 space-y-6 animate-pulse"
      >
        <span className="sr-only">{t("loading")}</span>
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-elevated" />
          <div className="mx-auto h-6 w-48 rounded bg-elevated" />
          <div className="h-12 w-full rounded-xl bg-elevated" />
          <div className="h-12 w-full rounded-xl bg-elevated" />
        </div>
        <div className="h-44 rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          <div className="h-4 w-28 rounded bg-elevated" />
          <div className="h-12 w-full rounded-xl bg-elevated" />
          <div className="h-12 w-full rounded-xl bg-elevated" />
        </div>
      </div>
    </main>
  );
}
