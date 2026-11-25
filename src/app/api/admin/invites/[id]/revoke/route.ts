import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { getSuperAdminSession } from "@/lib/auth-guard";
import { getServerEnv } from "@/lib/env";
import { isSameOriginRequest } from "@/lib/request-security";
import { revokeInvitation } from "@/services/invitations";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

const idParamSchema = z.uuid();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
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

  const { id } = await context.params;
  const parsedId = idParamSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Invalid invitation ID" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const revoked = await revokeInvitation(getDb(), parsedId.data);
  if (!revoked) {
    return NextResponse.json(
      { error: "Not Found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE_HEADERS });
}

// Prevent HTTP 405 method-existence oracle for non-Super-Admins
async function handleUnsupportedMethod(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Not Found" },
    { status: 404, headers: NO_STORE_HEADERS },
  );
}

export const GET = handleUnsupportedMethod;
export const PUT = handleUnsupportedMethod;
export const PATCH = handleUnsupportedMethod;
export const DELETE = handleUnsupportedMethod;
export const HEAD = handleUnsupportedMethod;
export const OPTIONS = handleUnsupportedMethod;
