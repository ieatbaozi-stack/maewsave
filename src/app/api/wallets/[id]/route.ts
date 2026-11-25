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
  validateUuidParam,
} from "@/lib/api-helpers";
import { updateWalletSchema } from "@/lib/validation/finance";
import { deleteWallet, updateWallet } from "@/services/wallets";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
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

  const { id: rawId } = await context.params;
  const idCheck = validateUuidParam(rawId);
  if (!idCheck.ok) {
    return idCheck.response;
  }

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validated = updateWalletSchema.safeParse(parsedBody.body);
  if (!validated.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const wallet = await updateWallet(
      db,
      auth.session.userId,
      idCheck.id,
      validated.data,
    );
    return NextResponse.json(
      { wallet },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return mapFinanceErrorToResponse(err);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
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

  const { id: rawId } = await context.params;
  const idCheck = validateUuidParam(rawId);
  if (!idCheck.ok) {
    return idCheck.response;
  }

  try {
    const result = await deleteWallet(db, auth.session.userId, idCheck.id);
    return NextResponse.json(
      { deletedId: result.id },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return mapFinanceErrorToResponse(err);
  }
}
