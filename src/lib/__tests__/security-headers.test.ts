import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, getSecurityHeaders } from "@/lib/security-headers";

describe("security headers", () => {
  it("includes all mandatory defense-in-depth headers in production", () => {
    const headers = getSecurityHeaders({ isDev: false, nonce: "abc123nonce" });
    const headerMap = new Map(headers.map((header) => [header.key, header.value]));

    expect(headerMap.get("X-Frame-Options")).toBe("DENY");
    expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headerMap.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerMap.get("Permissions-Policy")).toContain("camera=()");
    expect(headerMap.get("Permissions-Policy")).toContain("payment=()");
    expect(headerMap.get("Permissions-Policy")).not.toContain("interest-cohort");
    expect(headerMap.get("Content-Security-Policy")).toContain("'nonce-abc123nonce'");
  });

  it("enforces nonce-based strict-dynamic script-src and blocks unsafe-inline/unsafe-eval in production", () => {
    const cspWithNonce = buildContentSecurityPolicy({ isDev: false, nonce: "testNonce99" });
    const scriptDirective = cspWithNonce
      .split("; ")
      .find((directive) => directive.startsWith("script-src "));

    expect(cspWithNonce).toContain("default-src 'self'");
    expect(cspWithNonce).toContain("frame-ancestors 'none'");
    expect(cspWithNonce).toContain("object-src 'none'");
    expect(cspWithNonce).toContain("upgrade-insecure-requests");
    expect(scriptDirective).toBe("script-src 'self' 'nonce-testNonce99' 'strict-dynamic'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
  });

  it("falls back to script-src 'self' without unsafe-inline when no nonce is supplied in production", () => {
    const cspFallback = buildContentSecurityPolicy({ isDev: false });
    const scriptDirective = cspFallback
      .split("; ")
      .find((directive) => directive.startsWith("script-src "));

    expect(scriptDirective).toBe("script-src 'self'");
  });

  it("allows dev tooling scripts and omits HSTS / upgrade-insecure-requests in development", () => {
    const headers = getSecurityHeaders({ isDev: true, nonce: "devNonce" });
    const headerMap = new Map(headers.map((header) => [header.key, header.value]));
    const csp = headerMap.get("Content-Security-Policy") ?? "";

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(headerMap.has("Strict-Transport-Security")).toBe(false);
  });
});
