import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { SignInCardActions } from "@/components/auth/sign-in-card-actions";
import { MaewsaveMark } from "@/components/brand/maewsave-mark";
import { PreferencesControls } from "@/components/settings/preferences-controls";
import { getAuthorizedSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const signInSearchParamsSchema = z.object({
  error: z.union([z.string(), z.array(z.string())]).optional(),
});

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  let existingSession = null;
  try {
    existingSession = await getAuthorizedSession();
  } catch {
    existingSession = null;
  }

  if (existingSession) {
    redirect("/");
  }

  const parsedSearchParams = signInSearchParamsSchema.safeParse(await searchParams);
  const rawError = parsedSearchParams.success ? parsedSearchParams.data.error : undefined;
  const initialErrorCode = Array.isArray(rawError) ? rawError[0] : rawError;

  const tAuth = await getTranslations("auth");
  const tBrand = await getTranslations("brand");

  return (
    <main className="min-h-dvh bg-canvas px-4 pt-safe pb-safe flex flex-col justify-center">
      <div className="mx-auto w-full max-w-[420px] py-8 space-y-6">
        <section className="rounded-2xl border border-border-subtle bg-surface p-6 space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated text-brand-accent">
              <MaewsaveMark size={36} decorative />
            </div>
            <div className="space-y-1">
              <p className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
                {tBrand("name")}
              </p>
              <h1 className="text-[22px] font-semibold text-text-primary">
                {tAuth("signInTitle")}
              </h1>
              <p className="text-[14px] text-text-secondary">
                {tAuth("signInDescription")}
              </p>
            </div>
          </div>

          <SignInCardActions initialErrorCode={initialErrorCode} />
        </section>

        <PreferencesControls />
      </div>
    </main>
  );
}
