import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db";

const mockRelease = vi.fn();

vi.mock("@/services/invitations", () => ({
  releaseConsumedInviteSlot: (...args: unknown[]) => mockRelease(...args),
}));

import {
  clearPendingInviteCompensation,
  releasePendingInviteCompensation,
  trackPendingInviteCompensation,
} from "@/lib/invite-compensation";

describe("invite slot compensation helper", () => {
  const fakeDb = {} as Database;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRelease.mockResolvedValue(undefined);
  });

  it("releases a tracked invitation slot once and ignores subsequent calls", async () => {
    const token = {};
    trackPendingInviteCompensation(token, "inv-123");

    await releasePendingInviteCompensation(fakeDb, token);
    await releasePendingInviteCompensation(fakeDb, token);

    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledWith(fakeDb, "inv-123");
  });

  it("does not release after clearPendingInviteCompensation and swallows compensation DB errors", async () => {
    const clearedToken = {};
    trackPendingInviteCompensation(clearedToken, "inv-456");
    clearPendingInviteCompensation(clearedToken);
    await releasePendingInviteCompensation(fakeDb, clearedToken);
    expect(mockRelease).not.toHaveBeenCalled();

    const failingToken = {};
    trackPendingInviteCompensation(failingToken, "inv-789");
    mockRelease.mockRejectedValueOnce(new Error("transient db error"));
    await expect(releasePendingInviteCompensation(fakeDb, failingToken)).resolves.toBeUndefined();
  });
});
