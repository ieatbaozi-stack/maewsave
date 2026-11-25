import { NextResponse } from "next/server";
import type { Database } from "@/db";
import { buildRateLimitKey, type RateLimitRule } from "@/domain/rate-limit";
import {
  requireAuthorizedSession,
  UnauthorizedError,
  type AuthorizedSession,
} from "@/lib/auth-guard";
import { getServerEnv } from "@/lib/env";
import { isSameOriginRequest } from "@/lib/request-security";
import { uuidParamSchema } from "@/lib/validation/finance";
import { consumeRateLimit } from "@/services/rate-limit";
import { FinanceServiceError } from "@/services/wallets";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

export async function authenticateApiRequest(
  request: Request,
): Promise<
  | { ok: true; session: AuthorizedSession }
  | { ok: false; response: NextResponse }
> {
  try {
    const session = await requireAuthorizedSession(request.headers);
    return { ok: true, session };
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "UNAUTHORIZED" },
          { status: 401, headers: NO_STORE_HEADERS },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: "UNAUTHORIZED" },
        { status: 401, headers: NO_STORE_HEADERS },
      ),
    };
  }
}

export function enforceSameOrigin(request: Request): NextResponse | null {
  const env = getServerEnv();
  if (!isSameOriginRequest(request, env.BETTER_AUTH_URL)) {
    return NextResponse.json(
      { error: "FORBIDDEN" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  return null;
}

export async function enforceUserRateLimit(
  db: Database,
  userId: string,
  rule: RateLimitRule,
): Promise<NextResponse | null> {
  const key = buildRateLimitKey(rule.scope, userId);
  const result = await consumeRateLimit(db, {
    key,
    max: rule.max,
    windowSec: rule.windowSec,
  });

  if (!result.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterSec: result.retryAfterSec },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "X-Retry-After": String(result.retryAfterSec),
          "Retry-After": String(result.retryAfterSec),
        },
      },
    );
  }
  return null;
}

export async function parseJsonRequestBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    const body: unknown = await request.json();
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "INVALID_BODY" },
        { status: 400, headers: NO_STORE_HEADERS },
      ),
    };
  }
}

export function validateUuidParam(
  rawId: string,
): { ok: true; id: string } | { ok: false; response: NextResponse } {
  const parsed = uuidParamSchema.safeParse(rawId);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "INVALID_ID" },
        { status: 400, headers: NO_STORE_HEADERS },
      ),
    };
  }
  return { ok: true, id: parsed.data };
}

export function mapFinanceErrorToResponse(err: unknown): NextResponse {
  if (err instanceof FinanceServiceError) {
    return NextResponse.json(
      { error: err.code },
      { status: err.status, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(
    { error: "INTERNAL_ERROR" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}
