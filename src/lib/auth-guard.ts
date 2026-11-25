import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { getAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/services/invitations";

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

// Always queries super_admins directly in PostgreSQL (zero client/cookie caching)
export async function getSuperAdminSession(
  requestHeaders?: Headers,
): Promise<AuthorizedSession | null> {
  try {
    const authorized = await getAuthorizedSession(requestHeaders);
    if (!authorized) {
      return null;
    }

    const adminAllowed = await isSuperAdmin(getDb(), authorized.userId);
    return adminAllowed ? authorized : null;
  } catch {
    return null;
  }
}

export async function requireSuperAdminPageOrNotFound(
  requestHeaders?: Headers,
): Promise<AuthorizedSession> {
  const adminSession = await getSuperAdminSession(requestHeaders);
  if (!adminSession) {
    notFound();
  }
  return adminSession;
}
