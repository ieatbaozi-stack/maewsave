import { createHash, getRandomValues } from "node:crypto";

// 31 unambiguous uppercase alphanumeric characters (excludes O, 0, I, 1, L)
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;
export const INVITE_EXPIRY_DAYS_OPTIONS = [1, 3, 7, 14] as const;
export type InviteExpiryDays = (typeof INVITE_EXPIRY_DAYS_OPTIONS)[number];
export const INVITE_MAX_USES_MIN = 1;
export const INVITE_MAX_USES_MAX = 10;

export type InviteStatus = "active" | "exhausted" | "expired" | "revoked";

const INVITE_ALLOWED_CHARS = new Set(INVITE_ALPHABET.split(""));

export function normalizeInviteCode(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (cleaned.length !== INVITE_CODE_LENGTH) {
    return null;
  }

  for (const ch of cleaned) {
    if (!INVITE_ALLOWED_CHARS.has(ch)) {
      return null;
    }
  }

  return cleaned;
}

export function formatInviteCode(normalizedCode: string): string {
  const valid = normalizeInviteCode(normalizedCode);
  if (!valid) {
    throw new Error("Invalid invite code format");
  }
  return `${valid.slice(0, 4)}-${valid.slice(4)}`;
}

export function generateInviteCode(
  randomBytesProvider: (length: number) => Uint8Array = (length) => {
    const buffer = new Uint8Array(length);
    getRandomValues(buffer);
    return buffer;
  },
): string {
  const alphabetLen = INVITE_ALPHABET.length;
  // Largest multiple of 31 strictly <= 256 is 248 (eliminates modulo bias)
  const maxUnbiasedByte = Math.floor(256 / alphabetLen) * alphabetLen;
  const chars: string[] = [];

  while (chars.length < INVITE_CODE_LENGTH) {
    const chunk = randomBytesProvider(16);
    for (const byte of chunk) {
      if (byte < maxUnbiasedByte) {
        const ch = INVITE_ALPHABET[byte % alphabetLen];
        if (ch !== undefined) {
          chars.push(ch);
          if (chars.length === INVITE_CODE_LENGTH) {
            break;
          }
        }
      }
    }
  }

  return formatInviteCode(chars.join(""));
}

export function hashInviteCode(codeOrNormalized: string): string {
  const normalized = normalizeInviteCode(codeOrNormalized);
  if (!normalized) {
    throw new Error("Cannot hash invalid invite code");
  }
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function buildInviteUrl(baseUrl: string, formattedOrRawCode: string): string {
  const normalized = normalizeInviteCode(formattedOrRawCode);
  if (!normalized) {
    throw new Error("Cannot build invite URL with invalid code");
  }
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/sign-in#invite=${formatInviteCode(normalized)}`;
}

export function extractInviteFromHash(hash: string): string | null {
  const trimmed = hash.replace(/^#/, "").trim();
  if (!trimmed) {
    return null;
  }

  const params = new URLSearchParams(trimmed);
  const rawInvite = params.get("invite");
  if (!rawInvite) {
    return null;
  }

  const normalized = normalizeInviteCode(rawInvite);
  return normalized ? formatInviteCode(normalized) : null;
}

export function computeInviteStatus(
  invite: {
    usesCount: number;
    maxUses: number;
    expiresAt: Date;
    revokedAt: Date | null;
  },
  now: Date = new Date(),
): InviteStatus {
  if (invite.revokedAt !== null) {
    return "revoked";
  }
  if (invite.usesCount >= invite.maxUses) {
    return "exhausted";
  }
  if (invite.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}
