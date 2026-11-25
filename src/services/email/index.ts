import type { ServerEnv } from "@/lib/env";
import { LogEmailTransport } from "./log-transport";
import { SmtpEmailTransport } from "./smtp-transport";
import type { EmailTransport } from "./types";

export type { EmailMessage, EmailTransport } from "./types";
export { renderOtpEmail } from "./templates/otp-email";

export function createEmailTransport(env: ServerEnv): EmailTransport {
  if (env.EMAIL_TRANSPORT === "smtp") {
    if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
      throw new Error('Incomplete SMTP configuration for EMAIL_TRANSPORT="smtp"');
    }

    return new SmtpEmailTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    });
  }

  if (env.NODE_ENV === "production") {
    throw new Error('EMAIL_TRANSPORT="log" is forbidden in production');
  }

  return new LogEmailTransport();
}
