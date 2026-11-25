export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailTransport {
  readonly mode: "smtp" | "log" | "http";
  send(message: EmailMessage): Promise<void>;
}
