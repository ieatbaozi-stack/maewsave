import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const PLACEHOLDER_PATTERNS = [
  "generate-a-",
  "placeholder",
  "changeme",
  "replace-me",
  "your-",
  "example-secret",
] as const;

function hasAcceptableSecretEntropy(secret: string): boolean {
  const lower = secret.toLowerCase();
  if (PLACEHOLDER_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return false;
  }
  const uniqueChars = new Set(secret).size;
  return uniqueChars >= 8;
}

function getUrlProtocol(value: string): string | null {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
}

function hasSslRequired(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    return sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full";
  } catch {
    return false;
  }
}

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().min(1).optional());
const optionalHttpUrl = z.preprocess(
  emptyToUndefined,
  z
    .url("Must be a valid URL")
    .refine((value) => {
      const protocol = getUrlProtocol(value);
      return protocol === "https:" || protocol === "http:";
    }, "URL must use http:// or https://")
    .optional(),
);
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .min(32, "CRON_SECRET must be at least 32 characters")
    .refine(
      hasAcceptableSecretEntropy,
      "CRON_SECRET must not be a placeholder or low-entropy string",
    )
    .optional(),
);

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .trim()
      .min(1, "DATABASE_URL is required")
      .refine(
        (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
        "DATABASE_URL must be a PostgreSQL connection string",
      ),
    BETTER_AUTH_SECRET: z
      .string()
      .trim()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
      .refine(
        hasAcceptableSecretEntropy,
        "BETTER_AUTH_SECRET must not be a placeholder or low-entropy string",
      ),
    BETTER_AUTH_URL: z
      .url("BETTER_AUTH_URL must be a valid URL")
      .refine((value) => {
        const protocol = getUrlProtocol(value);
        return protocol === "https:" || protocol === "http:";
      }, "BETTER_AUTH_URL must use http:// or https://"),
    ALLOWED_USER_EMAIL: z
      .string()
      .trim()
      .pipe(z.email("ALLOWED_USER_EMAIL must be a valid email address")),
    GOOGLE_CLIENT_ID: z.string().trim().min(1, "GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(1, "GOOGLE_CLIENT_SECRET is required"),
    WEBAUTHN_RP_ID: optionalString,
    WEBAUTHN_ORIGIN: optionalHttpUrl,
    GEMINI_API_KEY: optionalString,
    CRON_SECRET: optionalSecret,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") {
      return;
    }

    if (getUrlProtocol(env.BETTER_AUTH_URL) !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL must use https:// in production",
      });
    }

    if (env.WEBAUTHN_ORIGIN && getUrlProtocol(env.WEBAUTHN_ORIGIN) !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["WEBAUTHN_ORIGIN"],
        message: "WEBAUTHN_ORIGIN must use https:// in production",
      });
    }

    if (!hasSslRequired(env.DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL must enforce sslmode=require (or verify-full) in production",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(rawEnv: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(rawEnv);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv === null) {
    cachedEnv = parseServerEnv(process.env);
  }
  return cachedEnv;
}

export function resetServerEnvCache(): void {
  cachedEnv = null;
}
