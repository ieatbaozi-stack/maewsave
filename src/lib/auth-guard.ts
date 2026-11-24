import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isAllowedEmail } from "@/lib/email-whitelist";
import { getServerEnv } from "@/lib/env";

export { isAllowedEmail, normalizeEmail } from "@/lib/email-whitelist";

export interface AuthorizedSession {
  userId: string;
  email: string;
  name: string;
  image: string | null;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getAuthorizedSession(
  requestHeaders?: Headers,
): Promise<AuthorizedSession | null> {
  const hdrs = requestHeaders ?? (await headers());
  const sessionResult = await getAuth().api.getSession({
    headers: hdrs,
  });

  if (!sessionResult?.user) {
    return null;
  }

  if (sessionResult.user.emailVerified !== true) {
    return null;
  }

  const { ALLOWED_USER_EMAIL } = getServerEnv();
  if (!isAllowedEmail(sessionResult.user.email, ALLOWED_USER_EMAIL)) {
    return null;
  }

  return {
    userId: sessionResult.user.id,
    email: sessionResult.user.email,
    name: sessionResult.user.name,
    image: sessionResult.user.image ?? null,
  };
}

export async function requireAuthorizedSession(
  requestHeaders?: Headers,
): Promise<AuthorizedSession> {
  const authorized = await getAuthorizedSession(requestHeaders);
  if (!authorized) {
    throw new UnauthorizedError();
  }
  return authorized;
}

export async function requireAuthorizedSessionOrRedirect(
  requestHeaders?: Headers,
): Promise<AuthorizedSession> {
  let authorized: AuthorizedSession | null = null;
  try {
    authorized = await getAuthorizedSession(requestHeaders);
  } catch {
    authorized = null;
  }

  if (!authorized) {
    redirect("/sign-in");
  }

  return authorized;
}
