import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthorizedSessionOrRedirect } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface ProtectedLayoutProps {
  children: ReactNode;
}

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  await requireAuthorizedSessionOrRedirect();
  return <AppShell>{children}</AppShell>;
}
