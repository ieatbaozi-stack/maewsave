import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  isValidLocale,
  LOCALE_COOKIE_NAME,
  type AppLocale,
} from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale: AppLocale = isValidLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;

  const messages = (
    await import(`../../messages/${locale}.json`) as { default: Record<string, unknown> }
  ).default;

  return {
    locale,
    messages,
  };
});
