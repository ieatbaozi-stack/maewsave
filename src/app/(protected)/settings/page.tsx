import { ChevronRight, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PreferencesControls } from "@/components/settings/preferences-controls";
import { getDb } from "@/db";
import { requireAuthorizedSessionOrRedirect } from "@/lib/auth-guard";
import { isSuperAdmin } from "@/services/invitations";

export default async function SettingsPage() {
  const session = await requireAuthorizedSessionOrRedirect();
  const [t, adminAllowed] = await Promise.all([
    getTranslations("settings"),
    isSuperAdmin(getDb(), session.userId),
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
          <span>{t("accountSecurityBadge")}</span>
        </div>
      </section>

      {adminAllowed && (
        <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
            {t("adminSection")}
          </h2>
          <Link
            href="/admin/invites"
            className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-elevated px-4 py-3 text-text-primary transition-opacity active:opacity-85"
          >
            <div className="flex items-start gap-3">
              <KeyRound className="mt-1 h-5 w-5 shrink-0 text-brand-accent" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-[15px] font-medium text-text-primary">
                  {t("manageInvitesLink")}
                </p>
                <p className="text-[13px] text-text-secondary">
                  {t("manageInvitesDescription")}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
          </Link>
        </section>
      )}

      <PreferencesControls showSignOut />
    </div>
  );
}
