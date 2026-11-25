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
  createCategorySchema,
  seedCategoriesSchema,
} from "@/lib/validation/finance";
import {
  createCategory,
  listCategories,
  seedStarterCategories,
} from "@/services/categories";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const categories = await listCategories(getDb(), auth.session.userId);
    return NextResponse.json(
      { categories },
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
  const mutationLimitError = await enforceUserRateLimit(
    db,
    auth.session.userId,
    RATE_LIMIT_RULES.FINANCE_MUTATION_USER_1M,
  );
  if (mutationLimitError) {
    return mutationLimitError;
  }

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  // Optional idempotent starter category seeding with dedicated hourly rate limit
  const seedAttempt = seedCategoriesSchema.safeParse(parsedBody.body);
  if (seedAttempt.success) {
    const seedLimitError = await enforceUserRateLimit(
      db,
      auth.session.userId,
      RATE_LIMIT_RULES.CATEGORY_SEED_USER_1H,
    );
    if (seedLimitError) {
      return seedLimitError;
    }

    try {
      const categories = await seedStarterCategories(
        db,
        auth.session.userId,
        seedAttempt.data.locale,
      );
      return NextResponse.json(
        { categories },
        { status: 201, headers: NO_STORE_HEADERS },
      );
    } catch (err) {
      return mapFinanceErrorToResponse(err);
    }
  }

  const validated = createCategorySchema.safeParse(parsedBody.body);
  if (!validated.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const category = await createCategory(
      db,
      auth.session.userId,
      validated.data,
    );
    return NextResponse.json(
      { category },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return mapFinanceErrorToResponse(err);
  }
}
