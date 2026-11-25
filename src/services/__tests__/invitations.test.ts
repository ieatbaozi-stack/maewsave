import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db";
import {
  consumeInviteCodeAtomically,
  createInvitation,
  isInviteCodeCurrentlyValid,
  isSuperAdmin,
  listInvitations,
  releaseConsumedInviteSlot,
  revokeInvitation,
} from "@/services/invitations";

function createInvitationsMockDb(config: {
  selectRows?: Array<Record<string, unknown>>;
  updateRows?: Array<Record<string, unknown>>;
  insertRows?: Array<Record<string, unknown>>;
}) {
  const selectLimit = vi.fn().mockResolvedValue(config.selectRows ?? []);
  const selectOrderBy = vi.fn().mockReturnValue({ limit: selectLimit });
  const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
  const selectFrom = vi.fn().mockReturnValue({
    where: selectWhere,
    orderBy: selectOrderBy,
  });

  const updateReturning = vi.fn().mockResolvedValue(config.updateRows ?? []);
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });

  const insertReturning = vi.fn().mockResolvedValue(config.insertRows ?? []);
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });

  const db = {
    select: vi.fn().mockReturnValue({ from: selectFrom }),
    update: vi.fn().mockReturnValue({ set: updateSet }),
    insert: vi.fn().mockReturnValue({ values: insertValues }),
  } as unknown as Database;

  return { db, insertValues, updateSet };
}

describe("invitations & super_admins service", () => {
  it("verifies super_admins directly from DB and rejects blank userId", async () => {
    const emptyMock = createInvitationsMockDb({ selectRows: [] });
    await expect(isSuperAdmin(emptyMock.db, "")).resolves.toBe(false);
    await expect(isSuperAdmin(emptyMock.db, "user-1")).resolves.toBe(false);

    const adminMock = createInvitationsMockDb({ selectRows: [{ userId: "admin-1" }] });
    await expect(isSuperAdmin(adminMock.db, "admin-1")).resolves.toBe(true);
  });

  it("checks invite validity without incrementing and rejects invalid format before DB", async () => {
    const mock = createInvitationsMockDb({ selectRows: [{ id: "inv-1" }] });
    await expect(isInviteCodeCurrentlyValid(mock.db, null)).resolves.toBe(false);
    await expect(isInviteCodeCurrentlyValid(mock.db, "0000-1111")).resolves.toBe(false);
    await expect(isInviteCodeCurrentlyValid(mock.db, "AB2C-D3EF")).resolves.toBe(true);
  });

  it("atomically consumes invite code and supports compensating release", async () => {
    const okMock = createInvitationsMockDb({ updateRows: [{ id: "inv-1" }] });
    await expect(consumeInviteCodeAtomically(okMock.db, "ab2c-d3ef")).resolves.toEqual({
      id: "inv-1",
    });

    const exhaustedMock = createInvitationsMockDb({ updateRows: [] });
    await expect(consumeInviteCodeAtomically(exhaustedMock.db, "ab2c-d3ef")).resolves.toBeNull();
    await expect(consumeInviteCodeAtomically(exhaustedMock.db, "INVALID")).resolves.toBeNull();

    await expect(releaseConsumedInviteSlot(okMock.db, "inv-1")).resolves.toBeUndefined();
    expect(okMock.updateSet).toHaveBeenCalled();
  });

  it("creates invitation storing SHA-256 hash only and returning raw code + #invite= URL once", async () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const expiresAt = new Date("2026-12-02T12:00:00Z");
    const mock = createInvitationsMockDb({
      insertRows: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          codeHash: "a".repeat(64),
          label: "Beta Tester",
          maxUses: 3,
          usesCount: 0,
          expiresAt,
          revokedAt: null,
          createdByUserId: "admin-1",
          createdAt: now,
        },
      ],
    });

    const created = await createInvitation(mock.db, {
      label: "  Beta Tester  ",
      expiresInDays: 7,
      maxUses: 3,
      createdByUserId: "admin-1",
      baseUrl: "https://app.example.test",
      now,
    });

    expect(created.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(created.inviteUrl).toBe(`https://app.example.test/sign-in#invite=${created.code}`);
    expect(created.status).toBe("active");

    const insertedArg = mock.insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedArg.codeHash).toHaveLength(64);
    expect(insertedArg.codeHash).not.toBe(created.code);
    expect(insertedArg.label).toBe("Beta Tester");
  });

  it("lists invitations with computed status and zero raw code/hash exposure, and revokes cleanly", async () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const listMock = createInvitationsMockDb({
      selectRows: [
        {
          id: "inv-1",
          label: "Family",
          usesCount: 1,
          maxUses: 1,
          expiresAt: new Date("2026-12-01T00:00:00Z"),
          revokedAt: null,
          createdAt: now,
        },
      ],
    });

    const list = await listInvitations(listMock.db, now);
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("exhausted");
    expect("codeHash" in (list[0] ?? {})).toBe(false);
    expect("code" in (list[0] ?? {})).toBe(false);

    const revokeOk = createInvitationsMockDb({ updateRows: [{ id: "inv-1" }] });
    await expect(revokeInvitation(revokeOk.db, "inv-1", now)).resolves.toBe(true);

    const revokeMissing = createInvitationsMockDb({ updateRows: [] });
    await expect(revokeInvitation(revokeMissing.db, "inv-missing", now)).resolves.toBe(false);
  });
});
