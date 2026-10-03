import { randomAvatar } from "./avatars";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";
import { randomBytes } from "crypto";
import { writeFile, access } from "fs/promises";
const db = new PrismaClient();
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.LOCAL_ACCOUNT_SEED !== "true"
  )
    throw new Error(
      "Local account fixtures require LOCAL_ACCOUNT_SEED=true outside production",
    );
  const output = process.env.LOCAL_ACCOUNT_OUTPUT;
  if (!output)
    throw new Error(
      "Set LOCAL_ACCOUNT_OUTPUT to a private local credential file",
    );
  try {
    await access(output);
    throw new Error(
      "Credential file already exists; refusing to replace it or reset passwords",
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const fixtures = [
    {
      email: "admin@tientruyen.local",
      name: "Quản trị Tiên Truyện",
      roles: ["READER", "ADMIN"],
      coins: 2000,
    },
    {
      email: "author@tientruyen.local",
      name: "Mặc Vân",
      roles: ["READER", "AUTHOR"],
      coins: 2000,
    },
    ...Array.from({ length: 5 }, (_, i) => ({
      email: `reader${i + 1}@tientruyen.local`,
      name: `Độc giả ${i + 1}`,
      roles: ["READER"],
      coins: 5000,
    })),
  ];
  if (
    await db.user.count({
      where: { email: { in: fixtures.map((f) => f.email) } },
    })
  )
    throw new Error(
      "One or more fixture accounts already exist; existing accounts are preserved",
    );
  const rows = await Promise.all(
    fixtures.map(async (f) => {
      const password = `TT-${randomBytes(15).toString("base64url")}!`;
      return {
        ...f,
        password,
        passwordHash: await argon.hash(password, { type: argon.argon2id }),
      };
    }),
  );
  await db.$transaction(
    async (tx) => {
      for (const row of rows) {
        const u = await tx.user.create({
          data: {
            email: row.email,
            name: row.name,
            avatar: randomAvatar(),
            roles: row.roles,
            passwordHash: row.passwordHash,
            emailVerified: true,
            totalTopupVnd: row.coins * 100,
            wallet: { create: { balance: row.coins } },
          },
        });
        await tx.walletTransaction.create({
          data: {
            userId: u.id,
            type: "LOCAL_SEED",
            amount: row.coins,
            balanceAfter: row.coins,
            refId: "local-account-fixture",
            idempotencyKey: `local-account-fixture:${u.id}`,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: u.id,
            action: "LOCAL_ACCOUNT_FIXTURE",
            targetId: u.id,
          },
        });
        if (row.roles.includes("AUTHOR")) {
          await tx.authorApplication.create({
            data: {
              userId: u.id,
              penName: row.name,
              bio: "Tài khoản tác giả thử nghiệm local.",
              genres: "Tiên hiệp",
              sampleText: "Hồ sơ thử nghiệm do chủ máy yêu cầu tạo.",
              status: "APPROVED",
              reviewedAt: new Date(),
            },
          });
          // Give the local author control of the existing original sample stories only.
          await tx.story.updateMany({
            where: { author: { email: "author@example.invalid" } },
            data: { authorId: u.id },
          });
        }
      }
    },
    { timeout: 30000 },
  );
  const text = [
    "# Tài khoản thử Tiên Truyện (chỉ local)",
    "",
    "Đăng nhập: http://localhost:3000/dang-nhap",
    "",
    "Đăng nhập bằng email và mật khẩu. Đừng chia sẻ file này.",
    "",
    ...rows.flatMap((r) => [
      `## ${r.name}`,
      `- Email: ${r.email}`,
      `- Mật khẩu: ${r.password}`,
      `- Hồng Ngọc ban đầu: ${r.coins} HN (tiền thử)`,
      "",
    ]),
  ].join("\n");
  await writeFile(output, text, { mode: 0o600, flag: "wx" });
  console.log(
    "Created 7 local accounts with ledger credits. Credentials saved privately to the requested file.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
