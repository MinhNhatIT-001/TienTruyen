import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { avatarGallery, randomAvatar, storeAvatar } from "../src/modules/users/avatar.service";
test("random avatar always uses the local gallery", () => {
  for (let i = 0; i < 100; i++) assert(avatarGallery.includes(randomAvatar()));
});
test("avatar upload rejects SVG, fake JPEG and oversized input", async () => {
  await assert.rejects(
    storeAvatar(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString(
        "base64",
      ),
    ),
  );
  await assert.rejects(
    storeAvatar(Buffer.from([255, 216, 255, 0, 0]).toString("base64")),
  );
  await assert.rejects(
    storeAvatar(Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64")),
  );
});
test("valid image is cropped and reencoded without source metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tt-avatar-test-"));
  try {
    const input = await sharp({
      create: { width: 500, height: 300, channels: 3, background: "#326d59" },
    })
      .png()
      .toBuffer();
    const url = await storeAvatar(input.toString("base64"), dir);
    assert.match(url, /^\/api\/avatars\/uploads\/[a-f0-9]{64}\.webp$/);
    const output = await readFile(join(dir, url.split("/").pop()!));
    const meta = await sharp(output).metadata();
    assert.equal(meta.width, 256);
    assert.equal(meta.height, 256);
    assert.equal(meta.format, "webp");
    assert.equal(meta.exif, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Vercel refuses ephemeral filesystem storage when Blob is not configured", async (t) => {
  const keys = ["VERCEL", "BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN"];
  const previous = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    }),
  );
  process.env.VERCEL = "1";
  delete process.env.BLOB_STORE_ID;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    storeAvatar(image.toString("base64")),
    /cloud chưa được cấu hình/,
  );
});
