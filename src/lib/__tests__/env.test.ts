import { afterEach, describe, expect, it } from "vitest";
import { getServerEnv, parseServerEnv, resetServerEnvCache } from "@/lib/env";

const TEST_AUTH_VALUE = "0123456789".repeat(4);
const TEST_CRON_VALUE = "abcdefghij".repeat(4);

const validProdEnv: Record<string, string | undefined> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@ep-demo.aws.neon.tech/neondb?sslmode=require",
  BETTER_AUTH_SECRET: TEST_AUTH_VALUE,
  BETTER_AUTH_URL: "https://app.example.test",
  ALLOWED_USER_EMAIL: "owner@example.com",
  GOOGLE_CLIENT_ID: "test-google-client-id-12345",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret-67890",
};

describe("parseServerEnv", () => {
  afterEach(() => {
    resetServerEnvCache();
  });

  it("parses valid required production environment variables", () => {
    const parsed = parseServerEnv(validProdEnv);

    expect(parsed.NODE_ENV).toBe("production");
    expect(parsed.ALLOWED_USER_EMAIL).toBe("owner@example.com");
    expect(parsed.BETTER_AUTH_URL).toBe("https://app.example.test");
  });

  it("defaults NODE_ENV to development and accepts postgres:// and http:// in development", () => {
    const parsed = parseServerEnv({
      ...validProdEnv,
      NODE_ENV: undefined,
      DATABASE_URL: "postgres://user:pass@localhost:5432/maewsave_dev",
      BETTER_AUTH_URL: "http://localhost:3000",
    });

    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.BETTER_AUTH_URL).toBe("http://localhost:3000");
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

  it("trims whitespace from ALLOWED_USER_EMAIL", () => {
    const parsed = parseServerEnv({
      ...validProdEnv,
      ALLOWED_USER_EMAIL: "  owner@example.com  ",
    });

    expect(parsed.ALLOWED_USER_EMAIL).toBe("owner@example.com");
  });

  it("rejects non-postgres DATABASE_URL", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        DATABASE_URL: "mysql://user:pass@localhost/db",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects DATABASE_URL without sslmode=require in production", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        DATABASE_URL: "postgresql://user:pass@ep-demo.aws.neon.tech/neondb",
      }),
    ).toThrow(/sslmode=require/);
  });

  it("rejects short, whitespace-only, low-entropy, or .env.example placeholder BETTER_AUTH_SECRET", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        BETTER_AUTH_SECRET: "short-secret",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        BETTER_AUTH_SECRET: " ".repeat(40),
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
  });

  it("rejects short or placeholder CRON_SECRET and accepts strong 32+ char CRON_SECRET", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        CRON_SECRET: "too-short",
      }),
    ).toThrow(/CRON_SECRET/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        CRON_SECRET: ["generate", "a", "32", "byte", "random", "hex", "string"].join("-"),
      }),
    ).toThrow(/CRON_SECRET/);

    const parsed = parseServerEnv({
      ...validProdEnv,
      CRON_SECRET: TEST_CRON_VALUE,
    });
    expect(parsed.CRON_SECRET).toBe(TEST_CRON_VALUE);
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

  it("rejects invalid ALLOWED_USER_EMAIL and missing Google OAuth credentials", () => {
    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        ALLOWED_USER_EMAIL: "not-an-email",
      }),
    ).toThrow(/ALLOWED_USER_EMAIL/);

    expect(() =>
      parseServerEnv({
        ...validProdEnv,
        GOOGLE_CLIENT_ID: "",
      }),
    ).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("caches getServerEnv until resetServerEnvCache is invoked", () => {
    const originalEnv = { ...process.env };
    try {
      Object.assign(process.env, validProdEnv);
      resetServerEnvCache();

      const first = getServerEnv();
      process.env.ALLOWED_USER_EMAIL = "other@example.com";
      const second = getServerEnv();
      expect(second.ALLOWED_USER_EMAIL).toBe(first.ALLOWED_USER_EMAIL);

      resetServerEnvCache();
      const third = getServerEnv();
      expect(third.ALLOWED_USER_EMAIL).toBe("other@example.com");
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
