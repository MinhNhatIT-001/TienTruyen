import { publicationDate } from "../reading/reading-policy";
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
import { randomBytes } from "crypto";
import { z } from "zod";
import { wordCount } from "../../common/policy";
import { db } from "../../database/prisma";
import { hash, fail, parse, AuthRequest, auth } from "../../common/http";
import { audit } from "../../common/audit";
import { economy, authorTier } from "../wallet/economy.service";
import { serial } from "../../database/transaction";
import {
  storyOwner,
  chapterInput,
  publishChapter,
} from "./publication.service";
@Controller("api")
export class AuthorController {
  @Get("author/stats") async authorStats(@Req() req: AuthRequest) {
    const authorId = auth(req, "AUTHOR").id;
    const stories = await db.story.findMany({
      where: { authorId },
      include: { _count: { select: { chapters: true, bookmarks: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return Promise.all(
      stories.map(async (story) => {
        const purchases = await db.chapterPurchase.findMany({
          where: { chapter: { storyId: story.id } },
          select: { id: true },
        });
        return {
          ...story,
          readers: await db.readingProgress.count({
            where: { storyId: story.id },
          }),
          sales: purchases.length,
          revenue:
            (
              await db.authorEarning.aggregate({
                where: {
                  purchaseId: { in: purchases.map((p) => p.id) },
                  status: { not: "REFUNDED" },
                },
                _sum: { amount: true },
              })
            )._sum.amount || 0,
        };
      }),
    );
  }

  @Get("author/stories/:id/drafts") async drafts(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    await storyOwner(req, id);
    return db.chapterDraft.findMany({
      where: { storyId: id, status: { not: "PUBLISHED" } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  @Post("author/stories/:id/drafts") async createDraft(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    await storyOwner(req, id);
    return serial(async (tx) => {
      if (
        (await tx.chapterDraft.count({
          where: { storyId: id, status: { not: "PUBLISHED" } },
        })) >= 100
      )
        fail("Tối đa 100 nháp đang viết cho mỗi truyện.");
      return tx.chapterDraft.create({ data: { storyId: id } });
    });
  }

  @Put("author/drafts/:id") async saveDraft(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const userId = auth(req, "AUTHOR").id;
    const data = parse(
      z
        .object({
          title: z.string().max(150),
          content: z.string().max(200000),
          isFree: z.boolean(),
          price: z.number().int().min(0).max(100),
          scheduledAt: z.iso.datetime().nullable(),
          expectedUpdatedAt: z.iso.datetime(),
          expectedRevision: z.number().int().nonnegative(),
        })
        .strict(),
      body,
    );
    const { expectedUpdatedAt, expectedRevision, scheduledAt, ...content } =
      data;
    const schedule = publicationDate(scheduledAt);
    if (schedule) parse(chapterInput, content);
    return serial(async (tx) => {
      const draft = await tx.chapterDraft.findFirst({
        where: {
          id,
          story: { authorId: userId },
          status: { not: "PUBLISHED" },
        },
      });
      if (!draft) fail("Không tìm thấy bản nháp.", 404);
      if (
        draft.revision !== expectedRevision ||
        draft.updatedAt.toISOString() !== expectedUpdatedAt
      )
        fail("Nháp đã được thay đổi ở nơi khác. Tải lại trước khi lưu.", 409);
      return tx.chapterDraft.update({
        where: { id },
        data: {
          ...content,
          revision: { increment: 1 },
          scheduledAt: schedule,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
          error: null,
        },
      });
    });
  }

  @Delete("author/drafts/:id") async deleteDraft(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return db.chapterDraft.deleteMany({
      where: {
        id,
        story: { authorId: auth(req, "AUTHOR").id },
        status: { not: "PUBLISHED" },
      },
    });
  }

  @Post("author/drafts/:id/publish") async publishDraft(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    const userId = auth(req, "AUTHOR").id;
    return serial(async (tx) => {
      const draft = await tx.chapterDraft.findFirst({
        where: { id, story: { authorId: userId } },
      });
      if (!draft) fail("Không tìm thấy bản nháp.", 404);
      if (draft.status === "PUBLISHED") return { id: draft.chapterId };
      return publishChapter(
        tx,
        userId,
        draft.storyId,
        parse(chapterInput, {
          title: draft.title,
          content: draft.content,
          isFree: draft.isFree,
          price: draft.price,
        }),
        id,
      );
    });
  }

  @Post("author/applications") async application(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req);
    const data = parse(
      z
        .object({
          penName: z.string().trim().min(2).max(60),
          bio: z.string().trim().min(20).max(2000),
          genres: z.string().min(2).max(100),
          sampleText: z
            .string()
            .max(100000)
            .refine(
              (v) => wordCount(v) >= 1000,
              "Đoạn văn mẫu cần ít nhất 1.000 chữ.",
            ),
          copyright: z.literal(true),
        })
        .strict(),
      body,
    );
    const last = await db.authorApplication.findFirst({
      where: { userId: a.id },
      orderBy: { createdAt: "desc" },
    });
    if (last?.status === "PENDING" || last?.status === "APPROVED")
      fail("Bạn đã có hồ sơ đang chờ hoặc đã được duyệt.");
    if (
      last?.reviewedAt &&
      Date.now() - last.reviewedAt.getTime() < 7 * 86400000
    )
      fail("Bạn có thể nộp lại sau 7 ngày kể từ ngày bị từ chối.");
    const { copyright, ...fields } = data;
    await audit(a.id, "AUTHOR_APPLICATION");
    return db.authorApplication.create({ data: { ...fields, userId: a.id } });
  }

  @Get("author/stories") async myStories(@Req() req: AuthRequest) {
    return db.story.findMany({
      where: { authorId: auth(req, "AUTHOR").id },
      include: { _count: { select: { chapters: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post("author/stories") async createStory(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req, "AUTHOR");
    const data = parse(
      z
        .object({
          title: z.string().trim().min(3).max(120),
          description: z.string().trim().min(30).max(5000),
          genre: z.enum([
            "Tiên hiệp",
            "Kiếm hiệp",
            "Huyền huyễn",
            "Cổ đại",
            "Ngôn tình",
            "Đô thị",
          ]),
          cover: z
            .enum([
              "jade",
              "ink",
              "rose",
              "violet",
              "amber",
              "moss",
              "coral",
              "blue",
            ])
            .default("jade"),
        })
        .strict(),
      body,
    );
    return serial(async (tx) => {
      const tier = await authorTier(a.id, tx);
      if (
        (await tx.story.count({
          where: {
            authorId: a.id,
            status: { in: ["PENDING", "APPROVED"] },
            progress: "Đang ra",
          },
        })) >= tier[3]
      )
        fail("Bạn đã đạt giới hạn truyện song song của cấp hiện tại.");
      const app = await tx.authorApplication.findFirst({
        where: { userId: a.id, status: "APPROVED" },
      });
      const slug =
        data.title
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d")
          .replace(/Đ/g, "d")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") +
        "-" +
        randomBytes(3).toString("hex");
      const s = await tx.story.create({
        data: {
          ...data,
          slug,
          authorId: a.id,
          penName: app?.penName || "Tác giả",
        },
      });
      await audit(a.id, "STORY_SUBMIT", s.id, tx);
      return s;
    });
  }

  @Get("author/stories/:id") async authorStory(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    const story = await storyOwner(req, id);
    return {
      ...story,
      chapters: await db.chapter.findMany({
        where: { storyId: id },
        select: {
          id: true,
          number: true,
          title: true,
          isFree: true,
          price: true,
        },
        orderBy: { number: "asc" },
      }),
    };
  }

  @Post("author/stories/:id/chapters") async createChapter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const a = auth(req, "AUTHOR"),
      data = parse(chapterInput, body);
    return serial((tx) => publishChapter(tx, a.id, id, data));
  }

  @Get("author/earnings") async earnings(@Req() req: AuthRequest) {
    const a = auth(req, "AUTHOR");
    const rows = await db.authorEarning.findMany({
      where: { authorId: a.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      rows,
      tier: await authorTier(a.id),
      total:
        (
          await db.authorEarning.aggregate({
            where: { authorId: a.id, status: "AVAILABLE" },
            _sum: { amount: true },
          })
        )._sum.amount || 0,
    };
  }

  @Put("author/stories/:id") async updateStory(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const story = await storyOwner(req, id);
    const data = parse(
      z
        .object({
          title: z.string().trim().min(3).max(120),
          description: z.string().trim().min(30).max(5000),
          progress: z.enum(["Đang ra", "Hoàn thành"]).optional(),
        })
        .strict(),
      body,
    );
    return db.story.update({
      where: { id },
      data: {
        ...data,
        ...(story.status === "REJECTED"
          ? { status: "PENDING", rejectReason: null }
          : {}),
      },
    });
  }

  @Put("author/stories/:id/prices") async bulkPrices(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const story = await storyOwner(req, id);
    const data = parse(
      z
        .object({
          from: z.number().int().positive(),
          to: z.number().int().positive(),
          isFree: z.boolean(),
          price: z.number().int().min(0).max(100),
        })
        .strict(),
      body,
    );
    if (data.to < data.from) fail("Khoảng chương không hợp lệ.");
    return serial(async (tx) => {
      const config = await economy(tx),
        tier = await authorTier(story.authorId, tx);
      const chapters = await tx.chapter.findMany({
        where: { storyId: id, number: { gte: data.from, lte: data.to } },
      });
      if (!chapters.length) fail("Không có chương trong khoảng đã chọn.");
      if (!data.isFree) {
        if (data.price < config.minPrice || data.price > tier[2])
          fail(`Giá phải từ ${config.minPrice} đến ${tier[2]} HN.`);
        if (chapters.some((c) => c.number <= config.minFreeChapters))
          fail("Các chương đọc thử phải miễn phí.");
        if (
          chapters.some(
            (c) => c.isFree && Date.now() - c.publishedAt.getTime() > 86400000,
          )
        )
          fail("Không thể khóa chương đã miễn phí quá 24 giờ.");
      }
      await tx.chapter.updateMany({
        where: { id: { in: chapters.map((c) => c.id) } },
        data: { isFree: data.isFree, price: data.isFree ? 0 : data.price },
      });
      await audit(story.authorId, "BULK_PRICE_CHANGE", id, tx);
      return { ok: true, count: chapters.length };
    });
  }

  @Get("author/chapters/:id") async chapterEditor(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    const chapter = await db.chapter.findUnique({ where: { id } });
    if (!chapter) fail("Không tìm thấy chương.", 404);
    await storyOwner(req, chapter.storyId);
    return chapter;
  }

  @Put("author/chapters/:id") async updateChapter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = parse(
      z
        .object({
          title: z.string().min(2).max(150),
          content: z.string().min(100).max(200000),
        })
        .strict(),
      body,
    );
    const chapter = await db.chapter.findUnique({ where: { id } });
    if (!chapter) fail("Không tìm thấy chương.", 404);
    const story = await storyOwner(req, chapter.storyId);
    const contentHash = hash(
      data.content.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim(),
    );
    const words = wordCount(data.content);
    return serial(async (tx) => {
      const duplicate = await tx.chapter.count({
        where: { id: { not: id }, contentHash },
      });
      const c = await tx.chapter.update({
        where: { id },
        data: {
          ...data,
          wordCount: words,
          contentHash,
          countedForLevel:
            chapter.countedForLevel && words >= 1000 && !duplicate,
        },
      });
      await audit(story.authorId, "CHAPTER_EDIT", id, tx);
      return { id: c.id };
    });
  }

  @Post("author/payouts") async payout(@Req() req: AuthRequest) {
    const a = auth(req, "AUTHOR");
    return serial(async (tx) => {
      if (
        await tx.payoutRequest.count({
          where: { authorId: a.id, status: "PENDING" },
        })
      )
        fail("Bạn đã có yêu cầu rút đang chờ xử lý.");
      const config = await economy(tx),
        sum = await tx.authorEarning.aggregate({
          where: { authorId: a.id, status: "AVAILABLE" },
          _sum: { amount: true },
        }),
        amount = sum._sum.amount || 0;
      if (amount * config.exchangeRate < config.minimumPayoutVnd)
        fail(`Số tiền rút tối thiểu là ${config.minimumPayoutVnd}đ.`);
      const p = await tx.payoutRequest.create({
        data: { authorId: a.id, amount },
      });
      await tx.authorEarning.updateMany({
        where: { authorId: a.id, status: "AVAILABLE" },
        data: { status: "RESERVED" },
      });
      await audit(a.id, "PAYOUT_REQUEST", p.id, tx);
      return p;
    });
  }
}
