import { describe, expect, it } from "vitest";
import {
  buildInviteUrl,
  computeInviteStatus,
  extractInviteFromHash,
  formatInviteCode,
  generateInviteCode,
  hashInviteCode,
  INVITE_ALPHABET,
  normalizeInviteCode,
} from "@/domain/invite-code";

describe("invite-code domain logic", () => {
  it("generates formatted 8-character XXXX-XXXX codes excluding ambiguous O/0/I/1/L", () => {
    for (let i = 0; i < 30; i += 1) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
      expect(code).not.toMatch(/[O0I1L]/);
    }
  });

  it("uses unbiased rejection sampling across multiple chunks to skip bytes >= 248", () => {
    let callCount = 0;
    const chunks = [
      new Uint8Array([255, 250, 248, 0, 1, 2]),
      new Uint8Array([249, 3, 4, 5, 6, 7]),
    ];
    const code = generateInviteCode(() => {
      const chunk = chunks[callCount] ?? new Uint8Array([0]);
      callCount += 1;
      return chunk;
    });
    const expectedRaw = INVITE_ALPHABET.slice(0, 8);
    expect(code).toBe(`${expectedRaw.slice(0, 4)}-${expectedRaw.slice(4)}`);
    expect(callCount).toBe(2);
  });

  it("normalizes case, hyphens, and whitespace to identical SHA-256 hashes", () => {
    const a = normalizeInviteCode("ab2c-d3ef");
    const b = normalizeInviteCode("AB2CD3EF");
    const c = normalizeInviteCode("  ab2c  d3ef ");

    expect(a).toBe("AB2CD3EF");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(formatInviteCode("ab2cd3ef")).toBe("AB2C-D3EF");
    expect(hashInviteCode("ab2c-d3ef")).toBe(hashInviteCode("AB2CD3EF"));
    expect(hashInviteCode("AB2CD3EF")).toHaveLength(64);
  });

  it("rejects forbidden ambiguous characters and invalid lengths", () => {
    expect(normalizeInviteCode("ABCD-EF0G")).toBeNull(); // 0
    expect(normalizeInviteCode("ABCD-EFOG")).toBeNull(); // O
    expect(normalizeInviteCode("ABCD-EFIG")).toBeNull(); // I
    expect(normalizeInviteCode("ABCD-EF1G")).toBeNull(); // 1
    expect(normalizeInviteCode("ABCD-EFLG")).toBeNull(); // L
    expect(normalizeInviteCode("ABC-DEF")).toBeNull(); // too short
    expect(normalizeInviteCode("ABCD-EFGH-2")).toBeNull(); // too long
    expect(normalizeInviteCode("")).toBeNull();
    expect(() => hashInviteCode("INVALID")).toThrow();
    expect(() => formatInviteCode("INVALID")).toThrow();
  });

  it("builds invite URLs strictly using #invite= hash fragment (never ?invite=)", () => {
    const url = buildInviteUrl("https://app.example.test/", "ab2cd3ef");
    expect(url).toBe("https://app.example.test/sign-in#invite=AB2C-D3EF");
    expect(url).not.toContain("?invite=");
    expect(() => buildInviteUrl("https://app.example.test", "BAD")).toThrow();
  });

  it("extracts and normalizes valid invite codes from URL hash fragments", () => {
    expect(extractInviteFromHash("#invite=ab2cd3ef")).toBe("AB2C-D3EF");
    expect(extractInviteFromHash("#foo=1&invite=AB2C-D3EF")).toBe("AB2C-D3EF");
    expect(extractInviteFromHash("#invite=0000-1111")).toBeNull();
    expect(extractInviteFromHash("#other=123")).toBeNull();
    expect(extractInviteFromHash("")).toBeNull();
  });

  it("computes invite status with precedence revoked > exhausted > expired > active", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const future = new Date("2026-11-30T12:00:00Z");
    const past = new Date("2026-11-20T12:00:00Z");

    expect(
      computeInviteStatus({ usesCount: 0, maxUses: 3, expiresAt: future, revokedAt: null }, now),
    ).toBe("active");
    expect(
      computeInviteStatus({ usesCount: 3, maxUses: 3, expiresAt: future, revokedAt: null }, now),
    ).toBe("exhausted");
    expect(
      computeInviteStatus({ usesCount: 0, maxUses: 3, expiresAt: past, revokedAt: null }, now),
    ).toBe("expired");
    expect(
      computeInviteStatus({ usesCount: 0, maxUses: 3, expiresAt: now, revokedAt: null }, now),
    ).toBe("expired");
    expect(
      computeInviteStatus({ usesCount: 3, maxUses: 3, expiresAt: past, revokedAt: null }, now),
    ).toBe("exhausted");
    expect(
      computeInviteStatus({ usesCount: 3, maxUses: 3, expiresAt: past, revokedAt: past }, now),
    ).toBe("revoked");
  });
});
