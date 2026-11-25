import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  INVITE_EXPIRY_DAYS_OPTIONS,
  INVITE_MAX_USES_MAX,
  INVITE_MAX_USES_MIN,
} from "@/domain/invite-code";
import { buildRateLimitKey, getUtcDateKey, RATE_LIMIT_RULES } from "@/domain/rate-limit";
import { getSuperAdminSession } from "@/lib/auth-guard";
import { getServerEnv } from "@/lib/env";
import { isSameOriginRequest } from "@/lib/request-security";
import { createInvitation, listInvitations } from "@/services/invitations";
import { consumeRateLimit } from "@/services/rate-limit";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

const createInviteBodySchema = z.object({
  label: z.string().trim().min(1).max(100),
  expiresInDays: z
    .number()
    .int()
    .refine(
      (days): days is (typeof INVITE_EXPIRY_DAYS_OPTIONS)[number] =>
        (INVITE_EXPIRY_DAYS_OPTIONS as readonly number[]).includes(days),
      "Invalid expiry duration",
    ),
  maxUses: z.number().int().min(INVITE_MAX_USES_MIN).max(INVITE_MAX_USES_MAX),
});

export async function GET(request: Request): Promise<NextResponse> {
  const adminSession = await getSuperAdminSession(request.headers);
  if (!adminSession) {
    return NextResponse.json(
      { error: "Not Found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const invites = await listInvitations(getDb());
  return NextResponse.json({ invites }, { status: 200, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request): Promise<NextResponse> {
  const adminSession = await getSuperAdminSession(request.headers);
  if (!adminSession) {
    return NextResponse.json(
      { error: "Not Found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const env = getServerEnv();
  if (!isSameOriginRequest(request, env.BETTER_AUTH_URL)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const db = getDb();
  const limitKey = buildRateLimitKey(
    RATE_LIMIT_RULES.ADMIN_CREATE_INVITE_DAILY.scope,
    `${adminSession.userId}:${getUtcDateKey()}`,
  );

  const limit = await consumeRateLimit(db, {
    key: limitKey,
    max: RATE_LIMIT_RULES.ADMIN_CREATE_INVITE_DAILY.max,
    windowSec: RATE_LIMIT_RULES.ADMIN_CREATE_INVITE_DAILY.windowSec,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const parsed = createInviteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invitation parameters" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const created = await createInvitation(db, {
    label: parsed.data.label,
    expiresInDays: parsed.data.expiresInDays,
    maxUses: parsed.data.maxUses,
    createdByUserId: adminSession.userId,
    baseUrl: env.BETTER_AUTH_URL,
  });

  return NextResponse.json(
    { invite: created },
    { status: 201, headers: NO_STORE_HEADERS },
  );
}

// Prevent HTTP 405 method-existence oracle for non-Super-Admins
async function handleUnsupportedMethod(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Not Found" },
    { status: 404, headers: NO_STORE_HEADERS },
  );
}

export const PUT = handleUnsupportedMethod;
export const PATCH = handleUnsupportedMethod;
export const DELETE = handleUnsupportedMethod;
export const HEAD = handleUnsupportedMethod;
export const OPTIONS = handleUnsupportedMethod;
