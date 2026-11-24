import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidLocale, LOCALE_COOKIE_NAME } from "@/i18n/config";

const mockCookieSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: mockCookieSet,
  })),
}));

import { setLocaleAction } from "@/app/actions/locale";

describe("locale configuration and Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates supported locales strictly", () => {
    expect(isValidLocale("th")).toBe(true);
    expect(isValidLocale("en")).toBe(true);
    expect(isValidLocale("TH")).toBe(false);
    expect(isValidLocale("fr")).toBe(false);
    expect(isValidLocale("")).toBe(false);
    expect(isValidLocale(undefined)).toBe(false);
  });

  it("sets HttpOnly SameSite=lax cookie for valid locales", async () => {
    const result = await setLocaleAction("en");

    expect(result).toEqual({ ok: true });
    expect(mockCookieSet).toHaveBeenCalledWith(
      LOCALE_COOKIE_NAME,
      "en",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      }),
    );
  });

  it("rejects invalid locales without setting any cookie", async () => {
    const result = await setLocaleAction("jp" as "en");

    expect(result).toEqual({ ok: false });
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});
