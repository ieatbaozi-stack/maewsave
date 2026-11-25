import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/lib/env";
import { createEmailTransport, renderOtpEmail } from "@/services/email";
import { LogEmailTransport } from "@/services/email/log-transport";

const baseEnv: ServerEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:pass@ep-demo.aws.neon.tech/neondb?sslmode=require",
  BETTER_AUTH_SECRET: "0123456789".repeat(4),
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  EMAIL_TRANSPORT: "log",
  OTP_DAILY_CAP: 400,
  SESSION_MAX_AGE_DAYS: 30,
};

describe("email transport layer and OTP template", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders bilingual TH + EN OTP email without OTP in subject and with ZERO clickable links", () => {
    const rendered = renderOtpEmail({ otp: "739204", expiresInMinutes: 10 });

    // Subject omits raw OTP for lock-screen & relay log privacy
    expect(rendered.subject).not.toContain("739204");
    expect(rendered.text).toContain("739204");
    expect(rendered.text).toContain("10 นาที");
    expect(rendered.text).toContain("10 minutes");
    expect(rendered.html).toContain("739204");

    // Anti-phishing guarantee: zero anchor tags and zero URLs in both text and html
    expect(rendered.html.toLowerCase()).not.toContain("<a ");
    expect(rendered.html.toLowerCase()).not.toContain("href=");
    expect(rendered.text).not.toMatch(/https?:\/\//i);
    expect(rendered.html).not.toMatch(/https?:\/\//i);

    expect(() => renderOtpEmail({ otp: "bad-otp" })).toThrow(/Invalid 6-digit OTP/);
  });

  it("throws when SMTP mode is requested with incomplete SMTP config", () => {
    expect(() =>
      createEmailTransport({
        ...baseEnv,
        EMAIL_TRANSPORT: "smtp",
      }),
    ).toThrow(/Incomplete SMTP configuration/);
  });

  it("selects LogEmailTransport in development and SmtpEmailTransport in smtp mode", () => {
    const logTransport = createEmailTransport(baseEnv);
    expect(logTransport.mode).toBe("log");

    const smtpTransport = createEmailTransport({
      ...baseEnv,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.test",
      EMAIL_TRANSPORT: "smtp",
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: 465,
      SMTP_USER: "mailbox@example.com",
      SMTP_PASS: "abcdefghijklmnop",
      SMTP_FROM: "maewsave <mailbox@example.com>",
    });
    expect(smtpTransport.mode).toBe("smtp");
  });

  it("forbids LogEmailTransport in production both at factory and runtime send", async () => {
    expect(() =>
      createEmailTransport({
        ...baseEnv,
        NODE_ENV: "production",
        EMAIL_TRANSPORT: "log",
      }),
    ).toThrow(/forbidden in production/i);

    vi.stubEnv("NODE_ENV", "production");
    const transport = new LogEmailTransport();
    await expect(
      transport.send({
        to: "user@example.com",
        subject: "test",
        text: "123456",
        html: "<p>123456</p>",
      }),
    ).rejects.toThrow(/production/i);
  });
});
