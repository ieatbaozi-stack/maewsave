import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { invitations, superAdmins } from "@/db/auth-schema";
import {
  buildInviteUrl,
  computeInviteStatus,
  generateInviteCode,
  hashInviteCode,
  normalizeInviteCode,
  type InviteStatus,
} from "@/domain/invite-code";

export interface InvitationSummary {
  id: string;
  label: string;
  status: InviteStatus;
  usesCount: number;
  maxUses: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedInvitationResult extends InvitationSummary {
  code: string;
  inviteUrl: string;
}

export async function isSuperAdmin(db: Database, userId: string): Promise<boolean> {
  if (!userId.trim()) {
    return false;
  }
  const rows = await db
    .select({ userId: superAdmins.userId })
    .from(superAdmins)
    .where(eq(superAdmins.userId, userId))
    .limit(1);

  return rows.length > 0;
}

export async function isInviteCodeCurrentlyValid(
  db: Database,
  rawCode: string | null | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if (!rawCode) {
    return false;
  }
  const normalized = normalizeInviteCode(rawCode);
  if (!normalized) {
    return false;
  }
  const codeHash = hashInviteCode(normalized);

  const rows = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.codeHash, codeHash),
        lt(invitations.usesCount, invitations.maxUses),
        gt(invitations.expiresAt, now),
        isNull(invitations.revokedAt),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

export async function consumeInviteCodeAtomically(
  db: Database,
  rawCode: string | null | undefined,
  now: Date = new Date(),
): Promise<{ id: string } | null> {
  if (!rawCode) {
    return null;
  }
  const normalized = normalizeInviteCode(rawCode);
  if (!normalized) {
    return null;
  }
  const codeHash = hashInviteCode(normalized);

  const updated = await db
    .update(invitations)
    .set({
      usesCount: sql`${invitations.usesCount} + 1`,
    })
    .where(
      and(
        eq(invitations.codeHash, codeHash),
        lt(invitations.usesCount, invitations.maxUses),
        gt(invitations.expiresAt, now),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id });

  return updated[0] ?? null;
}

export async function releaseConsumedInviteSlot(
  db: Database,
  invitationId: string,
): Promise<void> {
  await db
    .update(invitations)
    .set({
      usesCount: sql`GREATEST(${invitations.usesCount} - 1, 0)`,
    })
    .where(and(eq(invitations.id, invitationId), gt(invitations.usesCount, 0)));
}

export async function createInvitation(
  db: Database,
  params: {
    label: string;
    expiresInDays: number;
    maxUses: number;
    createdByUserId: string | null;
    baseUrl: string;
    now?: Date;
  },
): Promise<CreatedInvitationResult> {
  const now = params.now ?? new Date();
  const code = generateInviteCode();
  const codeHash = hashInviteCode(code);
  const expiresAt = new Date(now.getTime() + params.expiresInDays * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(invitations)
    .values({
      codeHash,
      label: params.label.trim(),
      maxUses: params.maxUses,
      usesCount: 0,
      expiresAt,
      createdByUserId: params.createdByUserId,
    })
    .returning();

  const record = inserted[0];
  if (!record) {
    throw new Error("Failed to insert invitation record");
  }

  return {
    id: record.id,
    label: record.label,
    status: computeInviteStatus(record, now),
    usesCount: record.usesCount,
    maxUses: record.maxUses,
    expiresAt: record.expiresAt.toISOString(),
    revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    code,
    inviteUrl: buildInviteUrl(params.baseUrl, code),
  };
}

export async function listInvitations(
  db: Database,
  now: Date = new Date(),
): Promise<InvitationSummary[]> {
  const rows = await db
    .select({
      id: invitations.id,
      label: invitations.label,
      usesCount: invitations.usesCount,
      maxUses: invitations.maxUses,
      expiresAt: invitations.expiresAt,
      revokedAt: invitations.revokedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .orderBy(desc(invitations.createdAt))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    status: computeInviteStatus(row, now),
    usesCount: row.usesCount,
    maxUses: row.maxUses,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function revokeInvitation(
  db: Database,
  invitationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(and(eq(invitations.id, invitationId), isNull(invitations.revokedAt)))
    .returning({ id: invitations.id });

  return updated.length > 0;
}
