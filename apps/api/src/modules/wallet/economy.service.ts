import { Prisma } from "@prisma/client";
import { levelFor } from "../../common/policy";
import { db } from "../../database/prisma";
import { fail } from "../../common/http";
export async function economy(tx: Prisma.TransactionClient = db) {
  const row = await tx.systemConfig.findUnique({ where: { key: "economy" } });
  if (!row) fail("Hệ thống chưa được khởi tạo. Hãy chạy seed.", 503);
  return row!.value as any;
}

export async function authorTier(
  id: string,
  tx: Prisma.TransactionClient = db,
) {
  const count = await tx.chapter.count({
    where: { story: { authorId: id }, countedForLevel: true, hidden: false },
  });
  return levelFor((await economy(tx)).authorLevels, count);
}
