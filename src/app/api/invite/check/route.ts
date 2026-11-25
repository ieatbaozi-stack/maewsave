import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { normalizeInviteCode } from "@/domain/invite-code";
import { buildRateLimitKey, RATE_LIMIT_RULES } from "@/domain/rate-limit";
import { getServerEnv } from "@/lib/env";
import {
  buildClearInviteCookieHeader,
  buildInviteCookieHeader,
  extractClientIp,
  isSameOriginRequest,
} from "@/lib/request-security";
import { isInviteCodeCurrentlyValid } from "@/services/invitations";
import { consumeRateLimit } from "@/services/rate-limit";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

const inviteCheckBodySchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export async function POST(request: Request): Promise<NextResponse> {
  let env;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json(
      { error: "invalid" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  if (!isSameOriginRequest(request, env.BETTER_AUTH_URL)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const db = getDb();
  const clientIp = extractClientIp(request.headers);

  // DB rate limit: <= 10 checks / 10 minutes per IP
  const limit = await consumeRateLimit(db, {
    key: buildRateLimitKey(RATE_LIMIT_RULES.INVITE_CHECK_IP.scope, clientIp),
    max: RATE_LIMIT_RULES.INVITE_CHECK_IP.max,
    windowSec: RATE_LIMIT_RULES.INVITE_CHECK_IP.windowSec,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterSec: limit.retryAfterSec },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "X-Retry-After": String(limit.retryAfterSec),
          "Retry-After": String(limit.retryAfterSec),
        },
      },
    );
  }

  const isProd = env.NODE_ENV === "production";
  const invalidResponse = (): NextResponse => {
    const res = NextResponse.json(
      { error: "invalid" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
    res.headers.append("Set-Cookie", buildClearInviteCookieHeader({ isProd }));
    return res;
  };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidResponse();
  }

  const parsed = inviteCheckBodySchema.safeParse(body);
  if (!parsed.success) {
    return invalidResponse();
  }

  const normalized = normalizeInviteCode(parsed.data.code);
  if (!normalized) {
    return invalidResponse();
  }

  const isValid = await isInviteCodeCurrentlyValid(db, normalized);
  if (!isValid) {
    // Identical error message for nonexistent, expired, exhausted, or revoked codes; clears stale cookie
    return invalidResponse();
  }

  const response = NextResponse.json({ valid: true }, { status: 200, headers: NO_STORE_HEADERS });
  response.headers.append(
    "Set-Cookie",
    buildInviteCookieHeader(normalized, { isProd }),
  );
  return response;
}
