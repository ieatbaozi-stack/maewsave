import { InvitesManager } from "@/components/admin/invites-manager";
import { getDb } from "@/db";
import { requireSuperAdminPageOrNotFound } from "@/lib/auth-guard";
import { listInvitations } from "@/services/invitations";

export const dynamic = "force-dynamic";

export default async function AdminInvitesPage() {
  // Defense-in-depth alongside src/app/admin/layout.tsx
  await requireSuperAdminPageOrNotFound();
  const initialInvites = await listInvitations(getDb());

  return <InvitesManager initialInvites={initialInvites} />;
}
