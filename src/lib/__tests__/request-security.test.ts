import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildClearInviteCookieHeader,
  buildInviteCookieHeader,
  constantTimeStringEqual,
  extractClientIp,
  isSameOriginRequest,
  normalizeClientIp,
  readCookieFromHeader,
} from "@/lib/request-security";

describe("request security helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes IPv4, unwraps IPv4-mapped IPv6 to canonical IPv4, and collapses native IPv6 to /64", () => {
    expect(normalizeClientIp("203.0.113.42")).toBe("203.0.113.42");
    expect(normalizeClientIp("2001:db8:85a3:1::1")).toBe("2001:0db8:85a3:0001::/64");
    expect(normalizeClientIp("2001:db8:85a3:1::dead:beef")).toBe("2001:0db8:85a3:0001::/64");

    // IPv4-mapped IPv6 (both dotted and hex forms) unwrap to distinct canonical IPv4 addresses
    expect(normalizeClientIp("::ffff:203.0.113.10")).toBe("203.0.113.10");
    expect(normalizeClientIp("::ffff:cb00:710a")).toBe("203.0.113.10");
    expect(normalizeClientIp("::ffff:198.51.100.55")).toBe("198.51.100.55");
    expect(normalizeClientIp("::ffff:203.0.113.10")).not.toBe(
      normalizeClientIp("::ffff:198.51.100.55"),
    );

    expect(normalizeClientIp("not-an-ip")).toBeNull();
    expect(normalizeClientIp(null)).toBeNull();
  });

  it("trusts x-vercel-forwarded-for only when VERCEL=1, otherwise prefers x-real-ip > rightmost x-forwarded-for", () => {
    vi.stubEnv("VERCEL", "1");
    expect(
      extractClientIp(
        new Headers({
          "x-vercel-forwarded-for": "198.51.100.2",
          "x-forwarded-for": "203.0.113.99",
        }),
      ),
    ).toBe("198.51.100.2");

    vi.stubEnv("VERCEL", "");
    // Outside Vercel, spoofed x-vercel-forwarded-for is ignored
    expect(
      extractClientIp(
        new Headers({
          "x-vercel-forwarded-for": "192.0.2.99",
          "x-real-ip": "198.51.100.7",
          "x-forwarded-for": "203.0.113.1, 203.0.113.2",
        }),
      ),
    ).toBe("198.51.100.7");

    // Attacker spoofing leftmost X-Forwarded-For cannot override proxy-appended rightmost IP
    expect(
      extractClientIp(
        new Headers({
          "x-forwarded-for": "192.0.2.1, 198.51.100.55",
        }),
      ),
    ).toBe("198.51.100.55");

    expect(extractClientIp(new Headers())).toBe("unknown");
  });

  it("validates Origin and Referer headers against allowed origin strictly", () => {
    const validOrigin = new Request("https://app.example.test/api/test", {
      method: "POST",
      headers: { Origin: "https://app.example.test" },
    });
    expect(isSameOriginRequest(validOrigin, "https://app.example.test")).toBe(true);

    const badOrigin = new Request("https://app.example.test/api/test", {
      method: "POST",
      headers: { Origin: "https://evil.example.test" },
    });
    expect(isSameOriginRequest(badOrigin, "https://app.example.test")).toBe(false);

    const validReferer = new Request("https://app.example.test/api/test", {
      method: "POST",
      headers: { Referer: "https://app.example.test/sign-in" },
    });
    expect(isSameOriginRequest(validReferer, "https://app.example.test")).toBe(true);

    const missingHeaders = new Request("https://app.example.test/api/test", { method: "POST" });
    expect(isSameOriginRequest(missingHeaders, "https://app.example.test")).toBe(false);
  });

  it("compares strings via fixed-length SHA-256 constantTimeStringEqual", () => {
    expect(constantTimeStringEqual("token-value-123", "token-value-123")).toBe(true);
    expect(constantTimeStringEqual("token-value-123", "token-value-124")).toBe(false);
    expect(constantTimeStringEqual("short", "much-longer-string")).toBe(false);
  });

  it("reads cookies safely and builds set/clear invite cookie headers", () => {
    expect(readCookieFromHeader("a=1; maewsave_invite=AB2CD3EF; b=2", "maewsave_invite")).toBe(
      "AB2CD3EF",
    );
    expect(readCookieFromHeader("other=1", "maewsave_invite")).toBeNull();
    expect(readCookieFromHeader(null, "maewsave_invite")).toBeNull();

    const prodHeader = buildInviteCookieHeader("AB2CD3EF", { isProd: true });
    expect(prodHeader).toContain("HttpOnly");
    expect(prodHeader).toContain("SameSite=Lax");
    expect(prodHeader).toContain("Secure");

    const clearHeader = buildClearInviteCookieHeader({ isProd: false });
    expect(clearHeader).toContain("Max-Age=0");
    expect(clearHeader).not.toContain("Secure");
  });
});
