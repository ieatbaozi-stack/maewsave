import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/auth-guard";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await getAuthorizedSession(request.headers);

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: session.userId,
          email: session.email,
          name: session.name,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
}
