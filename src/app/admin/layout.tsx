import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireSuperAdminPageOrNotFound } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  // Runs outside nested loading.tsx Suspense boundaries so non-Super-Admins always get HTTP 404
  await requireSuperAdminPageOrNotFound();
  return <AppShell>{children}</AppShell>;
}
