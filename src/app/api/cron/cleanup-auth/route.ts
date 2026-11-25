import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getServerEnv } from "@/lib/env";
import { constantTimeStringEqual } from "@/lib/request-security";
import { cleanupExpiredAuthRecords } from "@/services/otp";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

export async function GET(request: Request): Promise<NextResponse> {
  let cronSecret: string | undefined;
  try {
    cronSecret = getServerEnv().CRON_SECRET;
  } catch {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  if (!constantTimeStringEqual(authHeader, expected)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const deleted = await cleanupExpiredAuthRecords(getDb());
  return NextResponse.json(
    { ok: true, deleted },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
