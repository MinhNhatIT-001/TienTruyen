import { batchQuote } from "./reading-policy";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
} from "@nestjs/common";
import { z } from "zod";
import { splitRevenue } from "../../common/policy";
import { db } from "../../database/prisma";
import {
  hash,
  fail,
  parse,
  AuthRequest,
  auth,
  idempotency,
} from "../../common/http";
import { audit } from "../../common/audit";
import { serial } from "../../database/transaction";
import { authorTier } from "../wallet/economy.service";
@Controller("api")
export class ReadingController {
  @Get("notifications") async notifications(@Req() req: AuthRequest) {
    const userId = auth(req).id;
    return {
      rows: await db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      unread: await db.notification.count({ where: { userId, readAt: null } }),
    };
  }

  @Put("notifications/read") async readNotifications(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const { id } = parse(
      z.object({ id: z.string().max(100).optional() }).strict(),
      body,
    );
    return db.notification.updateMany({
      where: { userId: auth(req).id, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
  }

  @Put("library/:storyId") async updateShelf(
    @Req() req: AuthRequest,
    @Param("storyId") storyId: string,
    @Body() body: unknown,
  ) {
    const userId = auth(req).id,
      data = parse(
        z
          .object({
            shelf: z.enum(["READING", "FAVORITE", "FINISHED"]).optional(),
            followed: z.boolean().optional(),
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
    return db.bookmark.upsert({
      where: { userId_storyId: { userId, storyId } },
      create: { userId, storyId, ...data },
      update: data,
    });
  }

  @Put("reading/:slug/:number") async saveProgress(
    @Req() req: AuthRequest,
    @Param("slug") slug: string,
    @Param("number") value: string,
    @Body() body: unknown,
  ) {
    const userId = auth(req).id,
      chapter = parse(z.coerce.number().int().positive(), value),
      data = parse(
        z
          .object({ position: z.number().min(0).max(1), finished: z.boolean() })
          .strict(),
        body,
      );
    const c = await db.chapter.findFirst({
      where: {
        story: { slug, status: "APPROVED" },
        number: chapter,
        hidden: false,
      },
    });
    if (!c) fail("Không tìm thấy chương.", 404);
    if (
      !c.isFree &&
      !(await db.chapterPurchase.findUnique({
        where: { userId_chapterId: { userId, chapterId: c.id } },
      }))
    )
      fail("Bạn cần mở khóa chương.", 403);
    return db.readingProgress.upsert({
      where: { userId_storyId: { userId, storyId: c.storyId } },
      create: { userId, storyId: c.storyId, chapter, ...data },
      update: { chapter, ...data },
    });
  }

  @Get("recommendations") async recommendations(@Req() req: AuthRequest) {
    const userId = auth(req).id;
    const recent = await db.readingProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 15,
    });
    const saved = await db.bookmark.findMany({
      where: { userId },
      include: { story: { select: { genre: true } } },
      take: 30,
    });
    const read = await db.story.findMany({
      where: { id: { in: recent.map((r) => r.storyId) } },
      select: { genre: true },
    });
    const genres = [
      ...new Set([
        ...read.map((r) => r.genre),
        ...saved.map((r) => r.story.genre),
      ]),
    ];
    const rows = await db.story.findMany({
      where: {
        status: "APPROVED",
        id: { notIn: recent.map((r) => r.storyId) },
        ...(genres.length ? { genre: { in: genres } } : {}),
      },
      include: {
        _count: { select: { chapters: { where: { hidden: false } } } },
        ratings: { select: { score: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    });
    return rows.map(({ _count, ratings, ...story }) => ({
      ...story,
      chapterCount: _count.chapters,
      rating: ratings.length
        ? ratings.reduce((n, r) => n + r.score, 0) / ratings.length
        : 0,
      readers: 0,
    }));
  }

  @Post("purchases/batch") async batchPurchase(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const userId = auth(req).id,
      { chapterIds, expectedTotal } = parse(
        z
          .object({
            chapterIds: z.array(z.string().min(1).max(100)).min(1).max(50),
            expectedTotal: z.number().int().min(0).max(5000),
          })
          .strict(),
        body,
      ),
      key = `${userId}:batch:${idempotency(req)}`;
    const ids = [...new Set(chapterIds)].sort(),
      requestHash = hash(JSON.stringify({ ids, expectedTotal }));
    return serial(async (tx) => {
      const previous = await tx.walletTransaction.findUnique({
        where: { idempotencyKey: key },
      });
      if (previous) {
        if (previous.refId !== requestHash)
          fail("Mã giao dịch đã được dùng cho lựa chọn khác.", 409);
        return { ok: true, alreadyPurchased: true };
      }
      await tx.$queryRaw`SELECT "userId" FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
      const chapters = await tx.chapter.findMany({
        where: {
          id: { in: ids },
          hidden: false,
          story: { status: "APPROVED" },
        },
        include: {
          story: { select: { authorId: true } },
          purchases: { where: { userId }, select: { id: true } },
        },
        orderBy: { number: "asc" },
      });
      const { wanted, total } = batchQuote(
        chapters,
        ids,
        userId,
        expectedTotal,
      );
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < total)
        fail("Số dư Hồng Ngọc chưa đủ.", 402);
      if (!wanted.length) return { ok: true, alreadyPurchased: true, total: 0 };
      const tier = await authorTier(wanted[0].story.authorId, tx);
      let balance = wallet.balance;
      for (const c of wanted) {
        const split = splitRevenue(c.price, tier[4]);
        const purchase = await tx.chapterPurchase.create({
          data: {
            userId,
            chapterId: c.id,
            pricePaid: c.price,
            authorShare: split.author,
            platformShare: split.platform,
            rateApplied: tier[4],
          },
        });
        balance -= c.price;
        await tx.walletTransaction.create({
          data: {
            userId,
            type: "PURCHASE",
            amount: -c.price,
            balanceAfter: balance,
            refId: c.id,
            idempotencyKey: `${key}:${c.id}`,
          },
        });
        await tx.authorEarning.create({
          data: {
            authorId: c.story.authorId,
            purchaseId: purchase.id,
            amount: split.author,
          },
        });
      }
      await tx.wallet.update({ where: { userId }, data: { balance } });
      await tx.walletTransaction.create({
        data: {
          userId,
          type: "BATCH_RECEIPT",
          amount: 0,
          balanceAfter: balance,
          refId: requestHash,
          idempotencyKey: key,
        },
      });
      await audit(userId, "BATCH_PURCHASE", requestHash, tx);
      return { ok: true, count: wanted.length, total, balance };
    });
  }

  @Get("purchases") async purchases(@Req() req: AuthRequest) {
    return db.chapterPurchase.findMany({
      where: { userId: auth(req).id },
      include: {
        chapter: {
          select: {
            title: true,
            number: true,
            story: { select: { title: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  @Post("purchases/:chapterId") async purchase(
    @Param("chapterId") chapterId: string,
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      key = `${a.id}:buy:${idempotency(req)}`;
    const { expectedPrice } = parse(
      z
        .object({ expectedPrice: z.number().int().min(0).max(100).optional() })
        .strict(),
      body || {},
    );
    return serial(async (tx) => {
      const old = await tx.walletTransaction.findUnique({
        where: { idempotencyKey: key },
      });
      if (old) {
        if (old.refId !== chapterId)
          fail("Mã giao dịch đã được sử dụng cho chương khác.", 409);
        return { ok: true, alreadyPurchased: true };
      }
      const owned = await tx.chapterPurchase.findUnique({
        where: { userId_chapterId: { userId: a.id, chapterId } },
      });
      if (owned) return { ok: true, alreadyPurchased: true };
      const chapter = await tx.chapter.findFirst({
        where: { id: chapterId, hidden: false, story: { status: "APPROVED" } },
        include: { story: { select: { authorId: true } } },
      });
      if (!chapter) fail("Không tìm thấy chương.", 404);
      if (chapter!.isFree) return { ok: true, free: true };
      if (expectedPrice !== undefined && expectedPrice !== chapter.price)
        fail("Giá chương đã thay đổi. Hãy tải lại và xác nhận giá mới.", 409);
      if (chapter!.story.authorId === a.id)
        fail("Tác giả không thể tự mua chương của mình.");
      await tx.$queryRaw`SELECT "userId" FROM "Wallet" WHERE "userId" = ${a.id} FOR UPDATE`;
      const wallet = await tx.wallet.findUnique({ where: { userId: a.id } });
      if (!wallet || wallet.balance < chapter!.price)
        fail("Số dư Hồng Ngọc chưa đủ.", 402);
      const tier = await authorTier(chapter!.story.authorId, tx),
        split = splitRevenue(chapter!.price, tier[4]);
      const p = await tx.chapterPurchase.create({
        data: {
          userId: a.id,
          chapterId,
          pricePaid: chapter!.price,
          authorShare: split.author,
          platformShare: split.platform,
          rateApplied: tier[4],
        },
      });
      const w = await tx.wallet.update({
        where: { userId: a.id },
        data: { balance: { decrement: chapter!.price } },
      });
      await tx.walletTransaction.create({
        data: {
          userId: a.id,
          type: "PURCHASE",
          amount: -chapter!.price,
          balanceAfter: w.balance,
          refId: chapterId,
          idempotencyKey: key,
        },
      });
      await tx.authorEarning.create({
        data: {
          authorId: chapter!.story.authorId,
          purchaseId: p.id,
          amount: split.author,
        },
      });
      await audit(a.id, "PURCHASE", p.id, tx);
      return { ok: true, balance: w.balance };
    });
  }

  @Get("library") async library(@Req() req: AuthRequest) {
    const a = auth(req);
    return db.bookmark.findMany({
      where: { userId: a.id, story: { status: "APPROVED" } },
      include: {
        story: { include: { _count: { select: { chapters: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post("library/:storyId") async bookmark(
    @Req() req: AuthRequest,
    @Param("storyId") storyId: string,
  ) {
    const a = auth(req);
    if (
      !(await db.story.findFirst({
        where: { id: storyId, status: "APPROVED" },
      }))
    )
      fail("Không tìm thấy truyện.", 404);
    return db.bookmark.upsert({
      where: { userId_storyId: { userId: a.id, storyId } },
      update: {},
      create: { userId: a.id, storyId },
    });
  }

  @Delete("library/:storyId") async unbookmark(
    @Req() req: AuthRequest,
    @Param("storyId") storyId: string,
  ) {
    return db.bookmark.deleteMany({ where: { userId: auth(req).id, storyId } });
  }

  @Get("history") async history(@Req() req: AuthRequest) {
    const rows = await db.readingProgress.findMany({
      where: { userId: auth(req).id },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const stories = await db.story.findMany({
      where: { id: { in: rows.map((r) => r.storyId) }, status: "APPROVED" },
      select: { id: true, title: true, slug: true },
    });
    return rows.flatMap((r) => {
      const story = stories.find((s) => s.id === r.storyId);
      return story ? [{ ...r, story }] : [];
    });
  }
}
