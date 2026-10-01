import sharp from "sharp";
import { createHash, randomInt } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { resolve, join } from "path";
export const avatarGallery = Array.from(
  { length: 11 },
  (_, i) => `/avatars/avatar-${String(i + 1).padStart(2, "0")}.webp`,
);
export const randomAvatar = () =>
  avatarGallery[randomInt(avatarGallery.length)];
export const avatarDirectory = resolve(
  process.env.AVATAR_UPLOAD_DIR || "uploads/avatars",
);
export async function storeAvatar(base64: string, directory = avatarDirectory) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0)
    throw new Error("Ảnh không hợp lệ.");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 2 * 1024 * 1024)
    throw new Error("Ảnh tối đa 2 MB.");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP";
  if (!jpeg && !png && !webp)
    throw new Error("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
  const image = sharp(bytes, { limitInputPixels: 20000000, failOn: "warning" });
  const meta = await image.metadata();
  if ((meta.pages || 1) !== 1) throw new Error("Vui lòng chọn ảnh tĩnh.");
  const output = await image
    .rotate()
    .resize(256, 256, { fit: "cover", position: "attention" })
    .webp({ quality: 85 })
    .toBuffer();
  const file = createHash("sha256").update(output).digest("hex") + ".webp";
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, file), output, { mode: 0o644 });
  return `/api/avatars/uploads/${file}`;
}
