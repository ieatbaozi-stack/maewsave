import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, EmailTransport } from "./types";

export interface SmtpTransportConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export class SmtpDeliveryError extends Error {
  constructor() {
    super("SMTP_DELIVERY_FAILED");
    this.name = "SmtpDeliveryError";
  }
}

export class SmtpEmailTransport implements EmailTransport {
  readonly mode = "smtp" as const;
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpTransportConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch {
      // Never propagate nodemailer error objects containing recipient email PII or SMTP transcripts
      throw new SmtpDeliveryError();
    }
  }
}
