import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { getDb } from "@/db";
import {
  INVITE_EXPIRY_DAYS_OPTIONS,
  INVITE_MAX_USES_MAX,
  INVITE_MAX_USES_MIN,
} from "@/domain/invite-code";
import { getServerEnv } from "@/lib/env";
import { createInvitation } from "@/services/invitations";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const cliArgsSchema = z.object({
  label: z.string().trim().min(1).max(100).default("Bootstrap Invite"),
  days: z.coerce
    .number()
    .int()
    .refine(
      (d) => (INVITE_EXPIRY_DAYS_OPTIONS as readonly number[]).includes(d),
      `--days must be one of: ${INVITE_EXPIRY_DAYS_OPTIONS.join(", ")}`,
    )
    .default(1),
  maxUses: z.coerce
    .number()
    .int()
    .min(INVITE_MAX_USES_MIN)
    .max(INVITE_MAX_USES_MAX)
    .default(1),
});

function parseArgv(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      result[key] = next;
      i += 1;
    }
  }
  return result;
}

async function main(): Promise<void> {
  const raw = parseArgv(process.argv.slice(2));
  const parsed = cliArgsSchema.safeParse({
    label: raw.label,
    days: raw.days,
    maxUses: raw["max-uses"],
  });

  if (!parsed.success) {
    console.error("Invalid arguments:", parsed.error.issues.map((i) => i.message).join("; "));
    console.error('Usage: npm run invite -- --label "Owner Bootstrap" --days 1 --max-uses 1');
    process.exit(1);
  }

  const env = getServerEnv();
  const created = await createInvitation(getDb(), {
    label: parsed.data.label,
    expiresInDays: parsed.data.days,
    maxUses: parsed.data.maxUses,
    createdByUserId: null,
    baseUrl: env.BETTER_AUTH_URL,
  });

  console.log("");
  console.log("=== Invitation Created (Shown Once Only) ===");
  console.log(`Label:      ${created.label}`);
  console.log(`Code:       ${created.code}`);
  console.log(`Invite URL: ${created.inviteUrl}`);
  console.log(`Max Uses:   ${created.maxUses}`);
  console.log(`Expires At: ${created.expiresAt}`);
  console.log("============================================");
  console.log("");
  console.log("After signing in with this invite, grant Super Admin in Neon SQL Editor:");
  console.log("  INSERT INTO super_admins (user_id, note)");
  console.log("  SELECT id, 'Primary Owner' FROM \"user\" WHERE LOWER(email) = LOWER('<your-email>')");
  console.log("  ON CONFLICT (user_id) DO NOTHING;");
  console.log("");
}

main().catch((error: unknown) => {
  console.error("Failed to create bootstrap invitation:", error);
  process.exit(1);
});
