import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PreferencesControls } from "@/components/settings/preferences-controls";
import { requireAuthorizedSessionOrRedirect } from "@/lib/auth-guard";

export default async function SettingsPage() {
  const [session, t] = await Promise.all([
    requireAuthorizedSessionOrRedirect(),
    getTranslations("settings"),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold text-text-primary">{t("pageTitle")}</h1>

      <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
          {t("accountSection")}
        </h2>
        <div className="space-y-1">
          <p className="text-[13px] text-text-secondary">{t("signedInAs")}</p>
          <p className="text-[15px] font-medium text-text-primary break-all">
            {session.email}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-elevated px-3 py-2 text-[13px] font-medium text-status-income">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("singleUserBadge")}</span>
        </div>
      </section>

      <PreferencesControls showSignOut />
    </div>
  );
}
