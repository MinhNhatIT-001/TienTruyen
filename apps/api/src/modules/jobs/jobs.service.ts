import { providerOptions } from "../../integrations/providers";
import { HttpException } from "@nestjs/common";
import { db } from "../../database/prisma";
import { parse } from "../../common/http";
import { serial } from "../../database/transaction";
import { chapterInput, publishChapter } from "../author/publication.service";
export async function publishScheduledDrafts() {
  const due = await db.chapterDraft.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
    select: { id: true, revision: true },
  });
  for (const item of due) {
    try {
      await serial(async (tx) => {
        const draft = await tx.chapterDraft.findUnique({
          where: { id: item.id },
          include: { story: { select: { authorId: true } } },
        });
        if (
          !draft ||
          draft.status !== "SCHEDULED" ||
          draft.revision !== item.revision ||
          !draft.scheduledAt ||
          draft.scheduledAt > new Date()
        )
          return;
        await publishChapter(
          tx,
          draft.story.authorId,
          draft.storyId,
          parse(chapterInput, {
            title: draft.title,
            content: draft.content,
            isFree: draft.isFree,
            price: draft.price,
          }),
          draft.id,
        );
      });
    } catch (e) {
      if (e instanceof HttpException)
        await db.chapterDraft.updateMany({
          where: {
            id: item.id,
            status: "SCHEDULED",
            revision: item.revision,
            scheduledAt: { lte: new Date() },
          },
          data: {
            status: "FAILED",
            error: String(
              (e.getResponse() as { message?: string }).message ||
                "Không thể xuất bản. Kiểm tra quyền, giá và nội dung chương.",
            ).slice(0, 500),
          },
        });
    }
  }
}

export async function reconcilePayments(controller: {
  paymentState(
    order: Awaited<ReturnType<typeof db.topupOrder.findUniqueOrThrow>>,
  ): Promise<unknown>;
}) {
  if (!providerOptions().paymentReady) return;
  const orders = await db.topupOrder.findMany({
    where: {
      provider: "PAYOS",
      status: { in: ["PENDING", "EXPIRED"] },
      createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
    },
    orderBy: [
      { lastCheckedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ],
    take: 30,
  });
  for (const order of orders) {
    try {
      await controller.paymentState(order);
    } catch {
      console.warn("Payment reconciliation deferred:", order.id);
    } finally {
      await db.topupOrder.update({
        where: { id: order.id },
        data: { lastCheckedAt: new Date() },
      });
    }
  }
}

export async function ledgerCheck() {
  const rows = await db.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT COUNT(*)::bigint AS count FROM "Wallet" w LEFT JOIN (SELECT "userId", SUM(amount) AS total FROM "WalletTransaction" GROUP BY "userId") t ON t."userId"=w."userId" WHERE w.balance<>COALESCE(t.total,0)`;
  if (Number(rows[0]?.count) > 0)
    console.error("Wallet reconciliation mismatches:", Number(rows[0].count));
}
