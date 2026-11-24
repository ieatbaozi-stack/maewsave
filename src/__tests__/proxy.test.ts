import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

describe("Next.js request proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns fail-closed 401 with security headers for unauthenticated /api/* requests", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new NextRequest("https://app.example.test/api/session");
    const response = proxy(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toContain("'strict-dynamic'");
  });

  it("does not bypass auth for prefix-spoofed /api/auth-admin or /icon-evil paths", () => {
    const apiSpoof = proxy(new NextRequest("https://app.example.test/api/auth-admin"));
    expect(apiSpoof.status).toBe(401);

    const iconSpoof = proxy(new NextRequest("https://app.example.test/icon-evil"));
    expect(iconSpoof.status).toBe(307);
    expect(iconSpoof.headers.get("location")).toBe("https://app.example.test/sign-in");
  });

  it("redirects unauthenticated protected page requests to /sign-in with security headers", () => {
    const response = proxy(new NextRequest("https://app.example.test/settings"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/sign-in");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("allows public routes (/sign-in, /auth/complete, /api/auth/*, exact PWA assets)", () => {
    const publicUrls = [
      "https://app.example.test/sign-in",
      "https://app.example.test/auth/complete",
      "https://app.example.test/api/auth/callback/google",
      "https://app.example.test/manifest.json",
      "https://app.example.test/apple-touch-icon.png",
    ];

    for (const url of publicUrls) {
      const response = proxy(new NextRequest(url));
      expect(response.status, `expected 200 pass-through for ${url}`).toBe(200);
      expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    }
  });

  it("permits requests with Better Auth session cookie and emits nonce-based production CSP", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new NextRequest("https://app.example.test/", {
      headers: {
        cookie: "__Secure-better-auth.session_token=opaque-session-token-value",
      },
    });
    const response = proxy(request);

    expect(response.status).toBe(200);
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
  });
});
