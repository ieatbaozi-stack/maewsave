import { isValidOtpFormat, OTP_TTL_MINUTES } from "@/domain/otp";

export interface RenderedOtpEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderOtpEmail(params: {
  otp: string;
  expiresInMinutes?: number;
}): RenderedOtpEmail {
  const ttl = params.expiresInMinutes ?? OTP_TTL_MINUTES;
  const code = params.otp.trim();

  if (!isValidOtpFormat(code)) {
    throw new Error("Invalid 6-digit OTP format for email template");
  }

  // Keep raw OTP out of Subject line (lock-screen privacy & relay subject logs)
  const subject = "รหัสยืนยันเข้าสู่ระบบ maewsave / Your maewsave sign-in code";

  // Strictly zero clickable URLs to protect users against phishing
  const text = [
    "maewsave (แมวอ้วนเฮง)",
    "",
    `รหัสยืนยันเข้าสู่ระบบของคุณคือ: ${code}`,
    `รหัสนี้มีอายุ ${ttl} นาที และใช้ได้เพียงครั้งเดียว`,
    "หากคุณไม่ได้เป็นผู้ร้องขอ กรุณาเพิกเฉยอีเมลฉบับนี้",
    "",
    "---",
    "",
    `Your maewsave sign-in code is: ${code}`,
    `This code expires in ${ttl} minutes and can only be used once.`,
    "If you did not request this code, you can safely ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="th">
  <body style="margin:0;padding:24px;background-color:#F8F9FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:460px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;padding:24px;">
      <tr>
        <td style="font-size:14px;font-weight:600;color:#0F5C4D;letter-spacing:0.04em;text-transform:uppercase;padding-bottom:12px;">
          maewsave · แมวอ้วนเฮง
        </td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.5;color:#111827;padding-bottom:16px;">
          ใช้รหัส 6 หลักด้านล่างเพื่อเข้าสู่ระบบ (หมดอายุภายใน ${ttl} นาที)<br />
          <span style="color:#4B5563;font-size:14px;">Enter this 6-digit code to sign in (expires in ${ttl} minutes):</span>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#F1F3F5;border-radius:12px;text-align:center;">
          <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:0.25em;color:#111827;">${code}</span>
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;line-height:1.5;color:#4B5563;padding-top:16px;">
          อีเมลฉบับนี้ไม่มีลิงก์คลิกเพื่อความปลอดภัย หากคุณไม่ได้ร้องขอรหัสนี้ กรุณาเพิกเฉยได้เลย<br />
          For your security, this email contains no links. If you did not request this code, please ignore it.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
