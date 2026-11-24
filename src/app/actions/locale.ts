"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE_NAME, LOCALES, type AppLocale } from "@/i18n/config";

const localeSchema = z.enum(LOCALES);

// Intentionally public so the owner can switch TH/EN on /sign-in as well as inside the app.
// Strictly validated via Zod enum and scoped exclusively to a non-sensitive UI preference cookie.
export async function setLocaleAction(locale: AppLocale): Promise<{ ok: boolean }> {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) {
    return { ok: false };
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { ok: true };
}
