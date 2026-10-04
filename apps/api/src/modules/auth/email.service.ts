import nodemailer from "nodemailer";
export async function sendAccountEmail(
  to: string,
  subject: string,
  link: string,
) {
  if (!process.env.SMTP_URL) {
    if (process.env.NODE_ENV === "production")
      throw new Error("SMTP_URL must be configured");
    return;
  }
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  await transport.sendMail({
    from: process.env.MAIL_FROM || "Tiên Truyện <noreply@example.invalid>",
    to,
    subject,
    text: `${subject}\n\nMở liên kết này để tiếp tục: ${link}\n\nNếu không yêu cầu thao tác này, bạn có thể bỏ qua email.`,
  });
}
