export interface SecurityHeader {
  key: string;
  value: string;
}

export interface SecurityHeaderOptions {
  isDev?: boolean;
  nonce?: string;
}

export function buildContentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  const isDev = options.isDev ?? false;
  const nonce = options.nonce?.trim();

  let scriptSrc: string;
  if (isDev) {
    scriptSrc = "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  } else if (nonce) {
    scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  } else {
    scriptSrc = "script-src 'self'";
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "connect-src 'self'",
  ];

  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function getSecurityHeaders(options: SecurityHeaderOptions = {}): SecurityHeader[] {
  const isDev = options.isDev ?? false;

  const headers: SecurityHeader[] = [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options),
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];

  if (!isDev) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
