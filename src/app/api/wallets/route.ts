import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { RATE_LIMIT_RULES } from "@/domain/rate-limit";
import {
  authenticateApiRequest,
  enforceSameOrigin,
  enforceUserRateLimit,
  mapFinanceErrorToResponse,
  NO_STORE_HEADERS,
  parseJsonRequestBody,
} from "@/lib/api-helpers";
import {
  createWalletSchema,
  walletQuerySchema,
} from "@/lib/validation/finance";
import { createWallet, listWallets } from "@/services/wallets";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const rawQuery = {
    includeInactive: url.searchParams.get("includeInactive") ?? undefined,
  };
  const parsedQuery = walletQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const includeInactive = parsedQuery.data.includeInactive !== "false";
    const wallets = await listWallets(getDb(), auth.session.userId, {
      includeInactive,
    });
    return NextResponse.json(
      { wallets },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return mapFinanceErrorToResponse(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const csrfError = enforceSameOrigin(request);
  if (csrfError) {
    return csrfError;
  }

  const db = getDb();
  const rateLimitError = await enforceUserRateLimit(
    db,
    auth.session.userId,
    RATE_LIMIT_RULES.FINANCE_MUTATION_USER_1M,
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validated = createWalletSchema.safeParse(parsedBody.body);
  if (!validated.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const wallet = await createWallet(db, auth.session.userId, validated.data);
    return NextResponse.json(
      { wallet },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return mapFinanceErrorToResponse(err);
  }
}
