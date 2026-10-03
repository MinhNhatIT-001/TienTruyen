import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
const magic = Buffer.from("TTBACKUP1");
export function encryptBackup(value, password) {
  if (typeof password !== "string" || password.length < 32)
    throw new Error("BACKUP_PASSPHRASE must contain at least 32 characters.");
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    scryptSync(password, salt, 32),
    iv,
  );
  cipher.setAAD(magic);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), data]);
}
export function decryptBackup(buffer, password) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 54 ||
    !buffer.subarray(0, 9).equals(magic)
  )
    throw new Error("Invalid backup format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    scryptSync(password, buffer.subarray(9, 25), 32),
    buffer.subarray(25, 37),
  );
  decipher.setAAD(magic);
  decipher.setAuthTag(buffer.subarray(37, 53));
  return JSON.parse(
    Buffer.concat([
      decipher.update(buffer.subarray(53)),
      decipher.final(),
    ]).toString("utf8"),
  );
}
