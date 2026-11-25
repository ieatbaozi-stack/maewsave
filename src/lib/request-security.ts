import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const INVITE_COOKIE_NAME = "maewsave_invite";
export const INVITE_COOKIE_MAX_AGE_SECONDS = 30 * 60;

function normalizeIpv6Address(ipv6: string): string {
  const withoutZone = ipv6.split("%")[0] ?? ipv6;
  const normalized = withoutZone.toLowerCase();

  // Convert dotted IPv4 tail (e.g., ::ffff:203.0.113.10) into two 16-bit hex groups first
  const lastColon = normalized.lastIndexOf(":");
  const tail = normalized.slice(lastColon + 1);
  let raw = normalized;
  if (tail.includes(".") && isIP(tail) === 4) {
    const octets = tail.split(".").map((n) => Number.parseInt(n, 10));
    const hi = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
    const lo = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
    raw = `${normalized.slice(0, lastColon)}:${hi.toString(16)}:${lo.toString(16)}`;
  }

  const halves = raw.split("::");
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];
  const missing = Math.max(0, 8 - left.length - right.length);
  const full = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ]
    .slice(0, 8)
    .map((group) => group.padStart(4, "0"));

  // Unwrap IPv4-mapped IPv6 addresses (::ffff:a.b.c.d or ::ffff:xxxx:yyyy) back to canonical IPv4
  if (
    full[0] === "0000" &&
    full[1] === "0000" &&
    full[2] === "0000" &&
    full[3] === "0000" &&
    full[4] === "0000" &&
    full[5] === "ffff"
  ) {
    const hi = Number.parseInt(full[6] ?? "0", 16);
    const lo = Number.parseInt(full[7] ?? "0", 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }

  return `${full.slice(0, 4).join(":")}::/64`;
}

export function normalizeClientIp(rawIp: string | null | undefined): string | null {
  if (!rawIp) {
    return null;
  }
  const trimmed = rawIp.trim();
  const version = isIP(trimmed);
  if (version === 4) {
    return trimmed;
  }
  if (version === 6) {
    return normalizeIpv6Address(trimmed);
  }
  return null;
}

export function extractClientIp(headers: Headers): string {
  // Only trust Vercel edge header when actually deployed on Vercel
  if (process.env.VERCEL === "1") {
    const vercelIp = normalizeClientIp(headers.get("x-vercel-forwarded-for")?.split(",")[0]);
    if (vercelIp) {
      return vercelIp;
    }
  }

  const realIp = normalizeClientIp(headers.get("x-real-ip"));
  if (realIp) {
    return realIp;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take rightmost valid hop appended by the closest trusted proxy
    const candidates = forwardedFor
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const normalized = normalizeClientIp(candidates[i]);
      if (normalized) {
        return normalized;
      }
    }
  }

  return "unknown";
}

export function isSameOriginRequest(request: Request, allowedBaseUrl: string): boolean {
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(allowedBaseUrl).origin;
  } catch {
    return false;
  }

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    return originHeader === expectedOrigin;
  }

  const refererHeader = request.headers.get("referer");
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

export function constantTimeStringEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

export function readCookieFromHeader(
  cookieHeader: string | null | undefined,
  cookieName: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const name = part.slice(0, eqIndex).trim();
    if (name === cookieName) {
      const rawValue = part.slice(eqIndex + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }

  return null;
}

export function buildInviteCookieHeader(
  code: string,
  options: { isProd: boolean; maxAge?: number },
): string {
  const maxAge = options.maxAge ?? INVITE_COOKIE_MAX_AGE_SECONDS;
  const segments = [
    `${INVITE_COOKIE_NAME}=${encodeURIComponent(code)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (options.isProd) {
    segments.push("Secure");
  }
  return segments.join("; ");
}

export function buildClearInviteCookieHeader(options: { isProd: boolean }): string {
  return buildInviteCookieHeader("", { isProd: options.isProd, maxAge: 0 });
}
