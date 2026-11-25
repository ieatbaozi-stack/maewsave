import { afterEach, describe, expect, it } from "vitest";
import { getServerEnv, parseServerEnv, resetServerEnvCache } from "@/lib/env";

const TEST_AUTH_VALUE = "0123456789".repeat(4);
const TEST_CRON_VALUE = "abcdefghij".repeat(4);

const validProdEnv: Record<string, string | undefined> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@ep-demo.aws.neon.tech/neondb?sslmode=require",
  BETTER_AUTH_SECRET: TEST_AUTH_VALUE,
  BETTER_AUTH_URL: "https://app.example.test",
  GOOGLE_CLIENT_ID: "test-google-client-id-12345",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret-67890",
  EMAIL_TRANSPORT: "smtp",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_USER: "mailbox@example.com",
  SMTP_PASS: "abcdefghijklmnop",
  SMTP_FROM: "maewsave <mailbox@example.com>",
};

describe("parseServerEnv", () => {
  afterEach(() => {
    resetServerEnvCache();
  });

  it("parses valid required production environment variables with defaults", () => {
    const parsed = parseServerEnv(validProdEnv);

    expect(parsed.NODE_ENV).toBe("production");
    expect(parsed.EMAIL_TRANSPORT).toBe("smtp");
    expect(parsed.SMTP_PORT).toBe(465);
    expect(parsed.OTP_DAILY_CAP).toBe(400);
    expect(parsed.SESSION_MAX_AGE_DAYS).toBe(30);
  });

  it("defaults NODE_ENV to development, EMAIL_TRANSPORT to log, and accepts postgres:// + http:// in dev", () => {
    const parsed = parseServerEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/maewsave_dev",
      BETTER_AUTH_SECRET: TEST_AUTH_VALUE,
      BETTER_AUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "dev-client",
      GOOGLE_CLIENT_SECRET: "dev-secret",
    });

    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.EMAIL_TRANSPORT).toBe("log");
    expect(parsed.BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("forbids EMAIL_TRANSPORT=log in production and requires complete SMTP settings in smtp mode", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        EMAIL_TRANSPORT: "log",
      }),
    ).toThrow(/EMAIL_TRANSPORT/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        SMTP_PASS: "",
      }),
    ).toThrow(/SMTP_PASS/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        SMTP_PORT: "25",
      }),
    ).toThrow(/SMTP_PORT/);
  });

  it("treats empty optional environment variables as undefined", () => {
    const parsed = parseServerEnv({
      ...validProdEnv,
      GEMINI_API_KEY: "",
      WEBAUTHN_ORIGIN: "   ",
      CRON_SECRET: "",
    });

    expect(parsed.GEMINI_API_KEY).toBeUndefined();
    expect(parsed.WEBAUTHN_ORIGIN).toBeUndefined();
    expect(parsed.CRON_SECRET).toBeUndefined();
  });

  it("rejects non-postgres DATABASE_URL and missing sslmode=require in production", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        DATABASE_URL: "mysql://user:pass@localhost/db",
      }),
    ).toThrow(/DATABASE_URL/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        DATABASE_URL: "postgresql://user:pass@ep-demo.aws.neon.tech/neondb",
      }),
    ).toThrow(/sslmode=require/);
  });

  it("rejects short, whitespace-only, low-entropy, or placeholder secrets", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        BETTER_AUTH_SECRET: "too-short",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        BETTER_AUTH_SECRET: "a".repeat(36),
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        BETTER_AUTH_SECRET: ["generate", "a", "32", "byte", "random", "base64", "string"].join("-"),
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        CRON_SECRET: "too-short",
      }),
    ).toThrow(/CRON_SECRET/);

    const withCron = parseServerEnv({
      ...validProdEnv,
      CRON_SECRET: TEST_CRON_VALUE,
    });
    expect(withCron.CRON_SECRET).toBe(TEST_CRON_VALUE);
  });

  it("rejects non-HTTP schemes and non-HTTPS URLs in production", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        BETTER_AUTH_URL: "ftp://example.test",
      }),
    ).toThrow(/BETTER_AUTH_URL/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        BETTER_AUTH_URL: "http://app.example.test",
      }),
    ).toThrow(/https:\/\//);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        WEBAUTHN_ORIGIN: "http://app.example.test",
      }),
    ).toThrow(/WEBAUTHN_ORIGIN/);
  });

  it("caches getServerEnv until resetServerEnvCache is invoked", () => {
    const originalEnv = { ...process.env };
    try {
      Object.assign(process.env, validProdEnv);
      resetServerEnvCache();

      const first = getServerEnv();
      process.env.OTP_DAILY_CAP = "250";
      const second = getServerEnv();
      expect(second.OTP_DAILY_CAP).toBe(first.OTP_DAILY_CAP);

      resetServerEnvCache();
      const third = getServerEnv();
      expect(third.OTP_DAILY_CAP).toBe(250);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, originalEnv);
      resetServerEnvCache();
    }
  });
});
