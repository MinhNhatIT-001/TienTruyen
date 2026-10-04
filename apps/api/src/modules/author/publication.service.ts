import { Prisma } from "@prisma/client";
import { z } from "zod";
import { wordCount } from "../../common/policy";
import { db } from "../../database/prisma";
import { hash, fail, AuthRequest, auth } from "../../common/http";
import { audit } from "../../common/audit";
import { economy, authorTier } from "../wallet/economy.service";
export async function storyOwner(req: AuthRequest, id: string) {
  const user = auth(req, "AUTHOR");
  const story = await db.story.findUnique({ where: { id } });
  if (!story || story.authorId !== user.id) fail("Không tìm thấy truyện.", 404);
  return story!;
}

export const chapterInput = z
  .object({
    title: z.string().trim().min(2).max(150),
    content: z.string().trim().min(100).max(200000),
    isFree: z.boolean(),
    price: z.number().int().min(0).max(100),
  })
  .strict();

export async function publishChapter(
  tx: Prisma.TransactionClient,
  authorId: string,
  storyId: string,
  data: z.infer<typeof chapterInput>,
  draftId?: string,
) {
  const story = await tx.story.findFirst({
    where: { id: storyId, authorId, author: { roles: { has: "AUTHOR" } } },
  });
  if (!story) fail("Không tìm thấy truyện.", 404);
  if (story.status !== "APPROVED")
    fail("Truyện cần được duyệt trước khi đăng chương.");
  const config = await economy(tx),
    tier = await authorTier(authorId, tx);
  const latest = await tx.chapter.aggregate({
    where: { storyId: storyId },
    _max: { number: true },
  });
  const number = (latest._max.number || 0) + 1;
  if (number <= config.minFreeChapters && !data.isFree)
    fail(`Ít nhất ${config.minFreeChapters} chương đầu phải miễn phí.`);
  if (!data.isFree && (data.price < config.minPrice || data.price > tier[2]))
    fail(`Giá hợp lệ: ${config.minPrice}–${tier[2]} HN.`);
  const normalized = data.content
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim(),
    contentHash = hash(normalized),
    words = wordCount(data.content);
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const duplicate = await tx.chapter.count({ where: { contentHash } }),
    daily = await tx.chapter.count({
      where: {
        story: { authorId: authorId },
        countedForLevel: true,
        publishedAt: { gte: day },
      },
    });
  const c = await tx.chapter.create({
    data: {
      ...data,
      price: data.isFree ? 0 : data.price,
      storyId: storyId,
      number,
      wordCount: words,
      contentHash,
      countedForLevel: words >= 1000 && !duplicate && daily < 5,
    },
  });
  await tx.story.update({
    where: { id: storyId },
    data: { updatedAt: new Date() },
  });
  await audit(authorId, "CHAPTER_PUBLISH", c.id, tx);
  const followers = await tx.bookmark.findMany({
    where: { storyId, followed: true, userId: { not: authorId } },
    select: { userId: true },
  });
  if (followers.length)
    await tx.notification.createMany({
      data: followers.map((f) => ({
        userId: f.userId,
        title: `${story.title} · Chương ${c.number}: ${c.title}`,
        href: `/truyen/${story.slug}/${c.number}`,
        eventKey: `chapter:${c.id}:${f.userId}`,
      })),
      skipDuplicates: true,
    });
  if (draftId)
    await tx.chapterDraft.update({
      where: { id: draftId },
      data: { status: "PUBLISHED", chapterId: c.id, error: null },
    });
  return { id: c.id, number: c.number };
}
