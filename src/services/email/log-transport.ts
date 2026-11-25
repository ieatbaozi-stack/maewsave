import type { EmailMessage, EmailTransport } from "./types";

export class LogEmailTransport implements EmailTransport {
  readonly mode = "log" as const;

  async send(message: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("LogEmailTransport cannot be used in production.");
    }

    console.info(
      [
        "=== [DEV EMAIL LOG TRANSPORT] ===",
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        message.text,
        "=================================",
      ].join("\n"),
    );
  }
}
