import { getTranslations } from "next-intl/server";
import { AuthCompleteRedirect } from "@/components/auth/auth-complete-redirect";
import { MaewsaveMark } from "@/components/brand/maewsave-mark";

export const dynamic = "force-dynamic";

export default async function AuthCompletePage() {
  const tAuth = await getTranslations("auth");

  return (
    <main className="min-h-dvh bg-canvas px-4 pt-safe pb-safe flex flex-col items-center justify-center">
      <AuthCompleteRedirect />
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-4 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface border border-border-subtle text-brand-accent">
          <MaewsaveMark size={36} decorative />
        </div>
        <p className="text-[15px] font-medium text-text-secondary">{tAuth("signingIn")}</p>
      </div>
    </main>
  );
}
