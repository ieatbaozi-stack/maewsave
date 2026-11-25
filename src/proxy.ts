import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, getSecurityHeaders } from "@/lib/security-headers";

const PUBLIC_PAGE_PATHS = new Set(["/sign-in"]);
const PUBLIC_EXACT_ASSETS = new Set([
  "/manifest.json",
  "/favicon.ico",
  "/robots.txt",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/maewsave-mark.svg",
]);

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

function isPublicPath(pathname: string): boolean {
  if (
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/invite/check" ||
    pathname === "/api/cron/cleanup-auth"
  ) {
    return true;
  }
  if (PUBLIC_PAGE_PATHS.has(pathname) || PUBLIC_EXACT_ASSETS.has(pathname)) {
    return true;
  }
  if (pathname.startsWith("/_next/static/")) {
    return true;
  }
  return pathname === "/_next/image" || pathname.startsWith("/_next/image/");
}

function applySecurityHeaders(
  response: NextResponse,
  options: { isDev: boolean; nonce: string },
): NextResponse {
  for (const header of getSecurityHeaders(options)) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({ isDev, nonce });

  if (!isPublicPath(pathname)) {
    const sessionCookie = getSessionCookie(request);

    if (!sessionCookie) {
      // Admin endpoints/routes ALWAYS conceal existence with 404 (never 401/302)
      if (isAdminPath(pathname)) {
        if (pathname.startsWith("/api/")) {
          const notFoundJson = NextResponse.json(
            { error: "Not Found" },
            {
              status: 404,
              headers: { "Cache-Control": "no-store, private" },
            },
          );
          return applySecurityHeaders(notFoundJson, { isDev, nonce });
        }
        // Let /admin/* page route run requireSuperAdminPageOrNotFound() -> HTTP 404
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-nonce", nonce);
        requestHeaders.set("Content-Security-Policy", csp);
        const adminPageResponse = NextResponse.next({ request: { headers: requestHeaders } });
        adminPageResponse.headers.set("Cache-Control", "no-store, private");
        return applySecurityHeaders(adminPageResponse, { isDev, nonce });
      }

      if (pathname === "/api" || pathname.startsWith("/api/")) {
        const unauthorizedResponse = NextResponse.json(
          { error: "Unauthorized" },
          {
            status: 401,
            headers: { "Cache-Control": "no-store, private" },
          },
        );
        return applySecurityHeaders(unauthorizedResponse, { isDev, nonce });
      }

      const signInUrl = new URL("/sign-in", request.url);
      const redirectResponse = NextResponse.redirect(signInUrl);
      return applySecurityHeaders(redirectResponse, { isDev, nonce });
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (isAdminPath(pathname)) {
    response.headers.set("Cache-Control", "no-store, private");
  }

  return applySecurityHeaders(response, { isDev, nonce });
}

export const config = {
  matcher: [
    "/((?!_next/static/|_next/image(?:/|$)|(?:favicon\\.ico|manifest\\.json|apple-touch-icon\\.png|icon\\.svg|icon-192\\.png|icon-512\\.png|maewsave-mark\\.svg)$).*)",
  ],
};
