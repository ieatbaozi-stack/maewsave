export const LOCALES = ["th", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "th";
export const LOCALE_COOKIE_NAME = "maewsave_locale";

export function isValidLocale(value: string | undefined): value is AppLocale {
  return value === "th" || value === "en";
}
