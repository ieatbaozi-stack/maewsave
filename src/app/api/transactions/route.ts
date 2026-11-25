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
  ledgerQuerySchema,
  transactionPayloadSchema,
} from "@/lib/validation/finance";
import {
  createTransaction,
  getLedgerOverview,
  listTransactions,
} from "@/services/transactions";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const rawQuery = {
    month: url.searchParams.get("month") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    walletId: url.searchParams.get("walletId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    overview: url.searchParams.get("overview") ?? undefined,
  };

  const validated = ledgerQuerySchema.safeParse(rawQuery);
  if (!validated.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const db = getDb();

  try {
    if (validated.data.overview === "1") {
      const rateLimitError = await enforceUserRateLimit(
        db,
        auth.session.userId,
        RATE_LIMIT_RULES.FINANCE_OVERVIEW_USER_1M,
      );
      if (rateLimitError) {
        return rateLimitError;
      }

      const overview = await getLedgerOverview(db, auth.session.userId, {
        month: validated.data.month,
      });
      return NextResponse.json(
        { overview },
        { status: 200, headers: NO_STORE_HEADERS },
      );
    }

    const transactions = await listTransactions(
      db,
      auth.session.userId,
      validated.data,
    );
    return NextResponse.json(
      { transactions },
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

  const validated = transactionPayloadSchema.safeParse(parsedBody.body);
  if (!validated.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const transaction = await createTransaction(
      db,
      auth.session.userId,
      validated.data,
    );
    return NextResponse.json(
      { transaction },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return mapFinanceErrorToResponse(err);
  }
}
