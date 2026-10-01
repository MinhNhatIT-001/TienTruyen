import {
  createHmac,
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "crypto";
import nodemailer from "nodemailer";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer) {
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decode(value: string) {
  let bits = 0,
    n = 0;
  const bytes: number[] = [];
  for (const c of value.replace(/=+$/, "")) {
    const v = alphabet.indexOf(c.toUpperCase());
    if (v < 0) throw new Error("Invalid base32");
    n = (n << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((n >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
export function totp(secret: string, counter: number, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", decode(secret)).update(msg).digest();
  const offset = mac[mac.length - 1] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits)
    .toString()
    .padStart(digits, "0");
}
export function verifyTotp(
  secret: string,
  code: string,
  lastCounter: number,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1])
    if (
      counter > lastCounter &&
      timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))
    )
      return counter;
  return null;
}
function key() {
  const material = process.env.TOTP_ENCRYPTION_KEY;
  if (!material || material.length < 32)
    throw new Error("TOTP_ENCRYPTION_KEY must have at least 32 characters");
  return createHash("sha256").update(material).digest();
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64",
  );
}
export function decrypt(value: string) {
  const buffer = Buffer.from(value, "base64"),
    decipher = createDecipheriv("aes-256-gcm", key(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([
    decipher.update(buffer.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
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
