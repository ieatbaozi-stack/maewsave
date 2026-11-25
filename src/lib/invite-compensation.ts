import type { Database } from "@/db";
import { releaseConsumedInviteSlot } from "@/services/invitations";

// Request-scoped tracking of an atomically consumed invite ID so failed user inserts release it
const pendingInviteCompensation = new WeakMap<object, string>();

export function trackPendingInviteCompensation(token: object, invitationId: string): void {
  pendingInviteCompensation.set(token, invitationId);
}

export function clearPendingInviteCompensation(token: object): void {
  pendingInviteCompensation.delete(token);
}

export async function releasePendingInviteCompensation(
  db: Database,
  token: object,
): Promise<void> {
  const pendingId = pendingInviteCompensation.get(token);
  if (!pendingId) {
    return;
  }
  pendingInviteCompensation.delete(token);
  try {
    await releaseConsumedInviteSlot(db, pendingId);
  } catch {
    // Best-effort compensation: never mask the primary error
  }
}
