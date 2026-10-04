import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { db } from "../../database/prisma";
import { fail, parse, AuthRequest, auth } from "../../common/http";
import { audit } from "../../common/audit";
import { serial } from "../../database/transaction";
@Controller("api")
export class StoriesController {
  @Get("stories/:slug/ownership") async ownership(
    @Req() req: AuthRequest,
    @Param("slug") slug: string,
  ) {
    const userId = auth(req).id;
    return db.chapterPurchase.findMany({
      where: {
        userId,
        chapter: { story: { slug, status: "APPROVED" }, hidden: false },
      },
      select: { chapterId: true },
    });
  }

  @Get("stories") async stories(@Query("q") q?: string) {
    const rows = await db.story.findMany({
      where: {
        status: "APPROVED",
        ...(q
          ? {
              OR: [
                {
                  title: {
                    contains: q.slice(0, 100),
                    mode: "insensitive" as const,
                  },
                },
                {
                  penName: {
                    contains: q.slice(0, 100),
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { chapters: { where: { hidden: false } } } },
        ratings: { select: { score: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const readers = await db.readingProgress.groupBy({
      by: ["storyId"],
      where: { storyId: { in: rows.map((r) => r.id) } },
      _count: { userId: true },
    });
    return rows.map(({ _count, ratings, ...s }) => ({
      ...s,
      chapterCount: _count.chapters,
      rating: ratings.length
        ? ratings.reduce((n, r) => n + r.score, 0) / ratings.length
        : 0,
      readers: readers.find((r) => r.storyId === s.id)?._count.userId || 0,
    }));
  }

  @Get("stories/:slug") async story(@Param("slug") slug: string) {
    const s = await db.story.findFirst({
      where: { slug, status: "APPROVED" },
      include: {
        ratings: { select: { score: true } },
        chapters: {
          where: { hidden: false },
          select: {
            id: true,
            number: true,
            title: true,
            isFree: true,
            price: true,
          },
          orderBy: { number: "asc" },
        },
        comments: {
          where: { hidden: false },
          take: 100,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            content: true,
            parentId: true,
            createdAt: true,
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });
    if (!s) fail("Không tìm thấy truyện.", 404);
    const { ratings, ...story } = s;
    return {
      ...story,
      chapterCount: story.chapters.length,
      rating: ratings.length
        ? ratings.reduce((n, r) => n + r.score, 0) / ratings.length
        : 0,
      readers: await db.readingProgress.count({ where: { storyId: s.id } }),
    };
  }

  @Get("stories/:slug/chapters/:number") async chapter(
    @Param("slug") slug: string,
    @Param("number") number: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    const n = parse(z.coerce.number().int().positive(), number);
    const c = await db.chapter.findFirst({
      where: { story: { slug, status: "APPROVED" }, number: n, hidden: false },
      select: {
        id: true,
        number: true,
        title: true,
        isFree: true,
        price: true,
        storyId: true,
        story: { select: { title: true, slug: true } },
      },
    });
    if (!c) fail("Không tìm thấy chương.", 404);
    const [previous, next] = await Promise.all([
      db.chapter.findFirst({
        where: { storyId: c.storyId, hidden: false, number: { lt: n } },
        orderBy: { number: "desc" },
        select: { number: true },
      }),
      db.chapter.findFirst({
        where: { storyId: c.storyId, hidden: false, number: { gt: n } },
        orderBy: { number: "asc" },
        select: { number: true },
      }),
    ]);
    const navigation = {
      previousNumber: previous?.number || null,
      nextNumber: next?.number || null,
    };
    const purchased = req.identity
      ? await db.chapterPurchase.findUnique({
          where: {
            userId_chapterId: { userId: req.identity.id, chapterId: c!.id },
          },
        })
      : null;
    if (c!.isFree || purchased) {
      const content = await db.chapter.findUnique({
        where: { id: c!.id },
        select: { content: true },
      });
      const progress = req.identity
        ? await db.readingProgress.findUnique({
            where: {
              userId_storyId: { userId: req.identity.id, storyId: c!.storyId },
            },
          })
        : null;
      return {
        ...c,
        ...content,
        ...navigation,
        owned: !!purchased,
        position: progress?.chapter === n ? progress.position : 0,
        progressUpdatedAt: progress?.chapter === n ? progress.updatedAt : null,
      };
    }
    return { ...c, ...navigation };
  }

  @Post("stories/:id/comments") async comment(
    @Req() req: AuthRequest,
    @Param("id") storyId: string,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      { content, parentId } = parse(
        z
          .object({
            content: z.string().trim().min(1).max(2000),
            parentId: z.string().max(100).optional(),
          })
          .strict(),
        body,
      );
    if (
      !(await db.story.findFirst({
        where: { id: storyId, status: "APPROVED" },
      }))
    )
      fail("Không tìm thấy truyện.", 404);
    if (
      parentId &&
      !(await db.comment.findFirst({
        where: { id: parentId, storyId, hidden: false, parentId: null },
      }))
    )
      fail("Bình luận gốc không còn khả dụng.", 404);
    return serial(async (tx) => {
      const comment = await tx.comment.create({
        data: { userId: a.id, storyId, content, parentId },
      });
      if (parentId) {
        const parent = await tx.comment.findUnique({
          where: { id: parentId },
          include: { story: { select: { slug: true } } },
        });
        if (parent && !parent.hidden && parent.userId !== a.id)
          await tx.notification.create({
            data: {
              userId: parent.userId,
              title: `${a.id === parent.userId ? "Bạn" : "Một độc giả"} đã trả lời bình luận của bạn`,
              href: `/truyen/${parent.story.slug}?tab=comments`,
              eventKey: `reply:${comment.id}`,
            },
          });
      }
      return comment;
    });
  }

  @Delete("comments/:id") async hideComment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    const a = auth(req);
    const comment = await db.comment.findUnique({ where: { id } });
    if (!comment || (comment.userId !== a.id && !a.roles.includes("ADMIN")))
      fail("Không tìm thấy bình luận.", 404);
    return serial(async (tx) => {
      await tx.comment.updateMany({
        where: { OR: [{ id }, { parentId: id }] },
        data: { hidden: true },
      });
      await audit(a.id, "COMMENT_HIDE", id, tx);
      return { ok: true };
    });
  }

  @Post("stories/:id/rating") async rating(
    @Req() req: AuthRequest,
    @Param("id") storyId: string,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      { score } = parse(
        z.object({ score: z.number().int().min(1).max(5) }).strict(),
        body,
      );
    if (
      !(await db.story.findFirst({
        where: { id: storyId, status: "APPROVED" },
      }))
    )
      fail("Không tìm thấy truyện.", 404);
    return db.rating.upsert({
      where: { userId_storyId: { userId: a.id, storyId } },
      update: { score },
      create: { userId: a.id, storyId, score },
    });
  }

  @Post("reports") async report(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      data = parse(
        z
          .object({
            targetId: z.string().min(1).max(100),
            reason: z.string().trim().min(10).max(2000),
          })
          .strict(),
        body,
      );
    return db.report.create({ data: { ...data, userId: a.id } });
  }
}
