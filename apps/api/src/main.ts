import "reflect-metadata";
import { validJobAuthorization } from "./job-auth";
import { paymentReviewReason } from "./payment-policy";
import { batchQuote, publicationDate } from "./reading-policy";
import {
  providerOptions,
  paymentProvider,
  normalizePhone,
  smsVerification,
  oauthUrl,
  oauthIdentity,
  OAuthProvider,
  payos,
  payosSignature,
  verifyPayos,
} from "./providers";
import {
  avatarGallery,
  randomAvatar,
  storeAvatar,
  avatarDirectory,
} from "./avatars";
import { readFile } from "fs/promises";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import {
  Module,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  HttpException,
} from "@nestjs/common";
import { PrismaClient, Prisma } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import * as argon from "argon2";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { sendAccountEmail } from "./security";
import { splitRevenue, validSignature, levelFor, wordCount } from "./policy";
const db = new PrismaClient();
const production = process.env.NODE_ENV === "production";
const secret =
  process.env.JWT_SECRET ||
  (!production ? "development-only-change-this-secret-32chars" : "");
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const allowedOrigins = production
  ? [origin]
  : [...new Set([origin, "http://localhost:3000", "http://127.0.0.1:3000"])];
if (secret.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters");
if (
  production &&
  (!process.env.REDIS_URL ||
    !process.env.APP_ORIGIN?.startsWith("https://") ||
    secret.includes("replace-") ||
    secret.includes("development-"))
)
  throw new Error("Production requires Redis, HTTPS and a random JWT secret");
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    })
  : null;
redis?.on("error", () => {});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function fail(message: string, status = 400): never {
  throw new HttpException({ message }, status);
}
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    fail(result.error.issues.map((i) => i.message).join("; "));
  return result.data as T;
}
type AuthRequest = Request & {
  identity?: { id: string; roles: string[]; sid: string };
  rawBody?: Buffer;
};
function auth(req: AuthRequest, role?: string) {
  if (!req.identity) fail("Vui lòng đăng nhập để tiếp tục.", 401);
  if (role && !req.identity!.roles.includes(role))
    fail("Bạn chưa có quyền thực hiện thao tác này.", 403);
  return req.identity!;
}
async function audit(
  actorId: string | null,
  action: string,
  targetId?: string,
  tx: Prisma.TransactionClient = db,
) {
  await tx.auditLog.create({ data: { actorId, action, targetId } });
}
async function economy(tx: Prisma.TransactionClient = db) {
  const row = await tx.systemConfig.findUnique({ where: { key: "economy" } });
  if (!row) fail("Hệ thống chưa được khởi tạo. Hãy chạy seed.", 503);
  return row!.value as any;
}
async function serial<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 6; i++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        // A small serverless pool can queue concurrent purchases after a cold start.
        maxWait: 10000,
        timeout: 10000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" ||
          e.code === "P2002" ||
          (e.code === "P2010" && e.meta?.code === "40001")) &&
        i < 5
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 10 + Math.random() * 30),
        );
        continue;
      }
      throw e;
    }
  }
  throw new Error("Transaction failed");
}
function cookies(res: Response, access: string, refresh: string, csrf: string) {
  const common = {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
  };
  res.cookie("tt_access", access, { ...common, maxAge: 15 * 60 * 1000 });
  res.cookie("tt_refresh", refresh, { ...common, maxAge: 30 * 86400000 });
  res.cookie("tt_csrf", csrf, {
    ...common,
    httpOnly: false,
    maxAge: 30 * 86400000,
  });
}
async function session(userId: string, req: Request, res: Response) {
  const token = randomBytes(40).toString("hex");
  const s = await db.session.create({
    data: {
      userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      device: (req.headers["user-agent"] || "Unknown").slice(0, 250),
    },
  });
  cookies(
    res,
    jwt.sign({ sub: userId, sid: s.id }, secret, {
      expiresIn: "15m",
      issuer: "tientruyen",
      audience: "web",
    }),
    token,
    randomBytes(24).toString("hex"),
  );
}
const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .transform((value) => value.normalize("NFC"))
      .pipe(
        z
          .string()
          .min(8, "Tên hiển thị cần ít nhất 8 ký tự.")
          .max(15, "Tên hiển thị tối đa 15 ký tự."),
      ),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z
      .string()
      .min(10)
      .max(128)
      .refine(
        (v) =>
          !["password123", "1234567890", "qwerty12345", "12345678910"].includes(
            v.toLowerCase(),
          ),
        "Mật khẩu quá phổ biến.",
      ),
  })
  .strict();
const loginSchema = z
  .object({
    email: z.email().transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
const settingsSchema = z
  .object({
    fontSize: z.number().int().min(14).max(32),
    lineHeight: z.number().min(1.4).max(2.4),
    font: z.enum(["serif", "sans", "mono", "lexend"]),
    width: z.enum(["narrow", "medium", "wide", "full"]),
    theme: z.string().max(20),
    bg: z.string().regex(/^#[0-9a-f]{6}$/i),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  })
  .strict();
async function authorTier(id: string, tx: Prisma.TransactionClient = db) {
  const count = await tx.chapter.count({
    where: { story: { authorId: id }, countedForLevel: true, hidden: false },
  });
  return levelFor((await economy(tx)).authorLevels, count);
}
async function storyOwner(req: AuthRequest, id: string) {
  const user = auth(req, "AUTHOR");
  const story = await db.story.findUnique({ where: { id } });
  if (!story || story.authorId !== user.id) fail("Không tìm thấy truyện.", 404);
  return story!;
}
function idempotency(req: Request) {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(key))
    fail("Thiếu mã giao dịch hợp lệ.");
  return key as string;
}
const chapterInput = z
  .object({
    title: z.string().trim().min(2).max(150),
    content: z.string().trim().min(100).max(200000),
    isFree: z.boolean(),
    price: z.number().int().min(0).max(100),
  })
  .strict();
async function publishChapter(
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

@Controller("api")
class ApiController {
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

  @Get("auth/options") authOptions() {
    return providerOptions();
  }
  @Post("auth/phone/request") async requestPhone(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(
      z
        .object({ phone: z.string().max(30), link: z.boolean().optional() })
        .strict(),
      body,
    );
    const phone = normalizePhone(input.phone);
    const linkUser = input.link ? auth(req).id : undefined;
    if (
      !(await rateLimit(`sms:ip:${req.ip}`, 5, 3600)) ||
      !(await rateLimit(`sms:phone:${hash(phone)}`, 3, 600))
    )
      fail("Đã đạt giới hạn gửi SMS. Hãy thử lại sau.", 429);
    const result = await smsVerification({ To: phone, Channel: "sms" });
    if (typeof result.sid !== "string" || result.status !== "pending")
      fail("Không gửi được SMS. Hãy thử lại sau.", 503);
    const binding = randomBytes(32).toString("hex");
    await db.loginChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 86400000) } },
    });
    const challenge = await db.loginChallenge.create({
      data: {
        kind: "PHONE",
        bindingHash: hash(binding),
        payload: {
          phone,
          verificationSid: result.sid,
          ...(linkUser ? { linkUser } : {}),
        },
        expiresAt: new Date(Date.now() + 5 * 60000),
      },
    });
    res.cookie("tt_phone", binding, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
      maxAge: 5 * 60000,
    });
    return {
      challengeId: challenge.id,
      expiresIn: 300,
      resendAfter: 60,
      phone: `${phone.slice(0, 3)}••••${phone.slice(-3)}`,
    };
  }
  @Post("auth/phone/verify") async verifyPhone(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { challengeId, code } = parse(
      z
        .object({
          challengeId: z.string().max(100),
          code: z.string().regex(/^\d{6}$/, "Nhập mã SMS gồm 6 số."),
        })
        .strict(),
      body,
    );
    const challenge = await db.loginChallenge.findUnique({
      where: { id: challengeId },
    });
    if (
      !challenge ||
      challenge.kind !== "PHONE" ||
      challenge.usedAt ||
      challenge.expiresAt < new Date() ||
      challenge.bindingHash !== hash(String(req.cookies.tt_phone || ""))
    )
      fail("Mã đã hết hạn. Hãy gửi lại SMS.", 401);
    const payload = challenge.payload as {
      phone: string;
      verificationSid: string;
      linkUser?: string;
    };
    if (payload.linkUser && auth(req).id !== payload.linkUser)
      fail("Hãy đăng nhập lại để liên kết số điện thoại.", 401);
    const attempt = await db.loginChallenge.updateMany({
      where: {
        id: challengeId,
        attempts: { lt: 5 },
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { attempts: { increment: 1 } },
    });
    if (!attempt.count) fail("Đã nhập sai quá nhiều lần. Hãy gửi mã mới.", 429);
    const result = await smsVerification(
      { VerificationSid: payload.verificationSid, Code: code },
      true,
    );
    if (
      result.status !== "approved" ||
      result.sid !== payload.verificationSid ||
      result.to !== payload.phone
    )
      fail("Mã SMS không chính xác hoặc đã hết hạn.", 401);
    const passwordHash = await argon.hash(randomBytes(32).toString("hex"), {
      type: argon.argon2id,
    });
    const u = await serial(async (tx) => {
      const used = await tx.loginChallenge.updateMany({
        where: { id: challengeId, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!used.count) fail("Mã SMS đã sử dụng hoặc hết hạn.", 401);
      if (payload.linkUser) {
        const existing = await tx.user.findUnique({
          where: { phone: payload.phone },
        });
        if (existing && existing.id !== payload.linkUser)
          fail("Số điện thoại đã được liên kết với tài khoản khác.", 409);
        return tx.user.update({
          where: { id: payload.linkUser },
          data: { phone: payload.phone, phoneVerified: true },
        });
      }
      return tx.user.upsert({
        where: { phone: payload.phone },
        update: { phoneVerified: true },
        create: {
          phone: payload.phone,
          phoneVerified: true,
          email: `phone-${hash(payload.phone)}@accounts.invalid`,
          passwordHash,
          name: `Độc giả ${randomBytes(2).toString("hex")}`,
          avatar: randomAvatar(),
          wallet: { create: {} },
        },
      });
    });
    res.clearCookie("tt_phone", { path: "/" });
    await session(u.id, req, res);
    await audit(u.id, payload.linkUser ? "LINK_PHONE" : "LOGIN_PHONE");
    return { ok: true };
  }
  async startOAuth(
    provider: OAuthProvider,
    req: AuthRequest,
    res: Response,
    linkUser?: string,
  ) {
    const binding = randomBytes(32).toString("hex"),
      verifier = randomBytes(32).toString("base64url");
    oauthUrl(provider, "validate", "validate");
    await db.loginChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 86400000) } },
    });
    const challenge = await db.loginChallenge.create({
      data: {
        kind: provider,
        bindingHash: hash(binding),
        payload: { verifier, ...(linkUser ? { linkUser } : {}) },
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
    const url = oauthUrl(
      provider,
      challenge.id,
      createHash("sha256").update(verifier).digest("base64url"),
    );
    res.cookie(`tt_oauth_${provider}`, binding, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60000,
    });
    return url;
  }
  @Get("auth/oauth/:provider/start") async oauthStart(
    @Param("provider") value: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const provider = parse(z.enum(["google", "facebook"]), value);
    try {
      return res.redirect(await this.startOAuth(provider, req, res));
    } catch {
      return res.redirect(`${origin}/dang-nhap?authError=unavailable`);
    }
  }
  @Post("auth/oauth/:provider/link") async oauthLink(
    @Param("provider") value: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provider = parse(z.enum(["google", "facebook"]), value);
    return { url: await this.startOAuth(provider, req, res, auth(req).id) };
  }
  @Get("auth/oauth/:provider/callback") async oauthCallback(
    @Param("provider") value: string,
    @Query("state") state: string,
    @Query("code") code: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const provider = parse(z.enum(["google", "facebook"]), value);
    try {
      if (
        typeof state !== "string" ||
        state.length > 100 ||
        typeof code !== "string" ||
        code.length > 4096
      )
        fail("Phiên đăng nhập không hợp lệ.", 401);
      const challenge = await db.loginChallenge.findUnique({
        where: { id: state },
      });
      if (
        !challenge ||
        challenge.kind !== provider ||
        challenge.usedAt ||
        challenge.expiresAt < new Date() ||
        challenge.bindingHash !==
          hash(String(req.cookies[`tt_oauth_${provider}`] || ""))
      )
        fail("Phiên đăng nhập hết hạn.", 401);
      const p = challenge.payload as { verifier: string; linkUser?: string };
      if (p.linkUser && auth(req).id !== p.linkUser)
        fail("Phiên liên kết đã hết hạn.", 401);
      const consumed = await db.loginChallenge.updateMany({
        where: { id: state, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!consumed.count) fail("Phiên đăng nhập đã sử dụng.", 401);
      const profile = await oauthIdentity(provider, code, p.verifier);
      const passwordHash = await argon.hash(randomBytes(32).toString("hex"), {
        type: argon.argon2id,
      });
      const u = await serial(async (tx) => {
        const identity = await tx.socialAccount.findUnique({
          where: { provider_subject: { provider, subject: profile.subject } },
          include: { user: true },
        });
        if (p.linkUser) {
          if (identity && identity.userId !== p.linkUser)
            fail("Danh tính đã thuộc tài khoản khác.", 409);
          const existing = await tx.socialAccount.findUnique({
            where: { userId_provider: { userId: p.linkUser, provider } },
          });
          if (existing && existing.subject !== profile.subject)
            fail("Tài khoản đã liên kết một danh tính khác.", 409);
          if (!identity)
            await tx.socialAccount.create({
              data: { userId: p.linkUser, provider, subject: profile.subject },
            });
          return tx.user.findUniqueOrThrow({ where: { id: p.linkUser } });
        }
        if (identity) return identity.user;
        if (
          profile.email &&
          (await tx.user.findUnique({ where: { email: profile.email } }))
        )
          fail("EMAIL_EXISTS", 409);
        let name = Array.from(profile.name.normalize("NFC"))
          .slice(0, 15)
          .join("")
          .trim();
        if (name.length < 8) name = "Bạn đọc " + name.slice(0, 7);
        return tx.user.create({
          data: {
            email:
              profile.email ||
              `${provider}-${hash(profile.subject)}@accounts.invalid`,
            emailVerified: profile.verified,
            passwordHash,
            name,
            avatar: randomAvatar(),
            wallet: { create: {} },
            socialAccounts: { create: { provider, subject: profile.subject } },
          },
        });
      });
      await session(u.id, req, res);
      await audit(u.id, p.linkUser ? "LINK_OAUTH" : "LOGIN_OAUTH");
      res.clearCookie(`tt_oauth_${provider}`, { path: "/" });
      return res.redirect(`${origin}/tai-khoan`);
    } catch (e) {
      res.clearCookie(`tt_oauth_${provider}`, { path: "/" });
      const duplicate =
        e instanceof HttpException &&
        (e.getResponse() as any)?.message === "EMAIL_EXISTS";
      return res.redirect(
        `${origin}/dang-nhap?authError=${duplicate ? "email_exists" : "oauth_failed"}`,
      );
    }
  }

  @Get("jobs/:job") async scheduledJob(
    @Param("job") job: string,
    @Req() req: AuthRequest,
  ) {
    if (!validJobAuthorization(req.headers.authorization))
      fail("Không có quyền truy cập.", 401);
    if (!["publish", "payments", "ledger"].includes(job))
      fail("Không tìm thấy tác vụ.", 404);
    if (!redis) fail("Scheduler cần Redis.", 503);
    if (job === "payments" && !providerOptions().paymentReady)
      fail("payOS chưa được cấu hình.", 503);
    if (!(await redis!.set(`tt:job:${job}`, "running", "EX", 300, "NX")))
      return { status: "skipped", job };
    if (job === "publish") await publishScheduledDrafts();
    if (job === "payments") await reconcilePayments(this);
    if (job === "ledger") {
      // Hobby cron also reconciles missed payment callbacks once per day.
      await reconcilePayments(this);
      await ledgerCheck();
    }
    return { status: "completed", job };
  }
  @Get("health") async health() {
    await db.$queryRaw`SELECT 1`;
    return { ok: true };
  }
  @Get("config") async config() {
    return economy();
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
  @Post("auth/register") async register(@Body() body: unknown) {
    const input = parse(registerSchema, body);
    const exists = await db.user.findUnique({ where: { email: input.email } });
    if (exists)
      return {
        message: "Nếu địa chỉ hợp lệ, hồ sơ đăng ký đã được tiếp nhận.",
      };
    const passwordHash = await argon.hash(input.password, {
      type: argon.argon2id,
    });
    if (production && !process.env.SMTP_URL)
      fail("Đăng ký chưa khả dụng: dịch vụ email chưa được cấu hình.", 503);
    const u = await db.user.create({
      data: {
        email: input.email,
        name: input.name,
        avatar: randomAvatar(),
        passwordHash,
        wallet: { create: {} },
      },
    });
    const token = randomBytes(32).toString("hex");
    await db.oneTimeToken.create({
      data: {
        userId: u.id,
        tokenHash: hash(token),
        purpose: "VERIFY_EMAIL",
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await sendAccountEmail(
      u.email,
      "Xác minh email Tiên Truyện",
      `${origin}/xac-minh?token=${token}`,
    );
    await audit(u.id, "REGISTER");
    return {
      message: production
        ? "Kiểm tra email để xác minh tài khoản."
        : "Tài khoản đã tạo. Trong môi trường local, dùng nút xác minh bên dưới.",
      ...(!production ? { devVerifyToken: token } : {}),
    };
  }
  @Post("auth/verify") async verify(@Body() body: unknown) {
    const { token } = parse(
      z.object({ token: z.string().length(64) }).strict(),
      body,
    );
    return serial(async (tx) => {
      const t = await tx.oneTimeToken.findUnique({
        where: { tokenHash: hash(token) },
      });
      if (
        !t ||
        t.usedAt ||
        t.expiresAt < new Date() ||
        t.purpose !== "VERIFY_EMAIL"
      )
        fail("Liên kết xác minh đã hết hạn hoặc không hợp lệ.");
      await tx.oneTimeToken.update({
        where: { id: t!.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: t!.userId },
        data: { emailVerified: true },
      });
      return { message: "Đã xác minh tài khoản. Bạn có thể đăng nhập." };
    });
  }
  @Post("auth/login") async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, password } = parse(loginSchema, body);
    if (!(await rateLimit(`login:account:${hash(email)}`, 10, 900))) {
      res.setHeader("Retry-After", "900");
      fail("Đã vượt số lần đăng nhập. Vui lòng thử lại sau 15 phút.", 429);
    }
    const u = await db.user.findUnique({ where: { email } });
    if (!u || !(await argon.verify(u.passwordHash, password)))
      fail("Email hoặc mật khẩu không chính xác.", 401);
    if (!u.emailVerified)
      fail("Vui lòng xác minh email trước khi đăng nhập.", 403);
    await session(u.id, req, res);
    await audit(u.id, "LOGIN");
    return { ok: true };
  }
  @Post("auth/refresh") async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.tt_refresh;
    if (typeof raw !== "string") fail("Phiên đăng nhập đã hết hạn.", 401);
    const result = await serial(async (tx) => {
      const old = await tx.session.findUnique({
        where: { tokenHash: hash(raw) },
      });
      if (!old) return null;
      if (old.revokedAt) {
        await tx.session.updateMany({
          where: { userId: old.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (old.expiresAt < new Date()) return null;
      await tx.session.update({
        where: { id: old.id },
        data: { revokedAt: new Date() },
      });
      const token = randomBytes(40).toString("hex");
      const replacement = await tx.session.create({
        data: {
          userId: old.userId,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 30 * 86400000),
          device: old.device,
        },
      });
      return { token, sid: replacement.id, userId: old.userId };
    });
    if (!result) fail("Vui lòng đăng nhập lại.", 401);
    cookies(
      res,
      jwt.sign({ sub: result.userId, sid: result.sid }, secret, {
        expiresIn: "15m",
        issuer: "tientruyen",
        audience: "web",
      }),
      result.token,
      randomBytes(24).toString("hex"),
    );
    return { ok: true };
  }
  @Get("auth/me") async me(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    const a = auth(req);
    const u = await db.user.findUnique({
      where: { id: a.id },
      select: {
        id: true,
        name: true,
        avatar: true,
        email: true,
        phone: true,
        phoneVerified: true,
        socialAccounts: { select: { provider: true } },
        roles: true,
        emailVerified: true,
        totalTopupVnd: true,
        readerSettings: true,
        wallet: { select: { balance: true } },
      },
    });
    return {
      ...u,
      balance: u?.wallet?.balance || 0,
      wallet: undefined,
    };
  }
  @Post("auth/logout") async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const a = auth(req);
    await db.session.update({
      where: { id: a.sid },
      data: { revokedAt: new Date() },
    });
    for (const key of ["tt_access", "tt_refresh", "tt_csrf"])
      res.clearCookie(key, { path: "/" });
    await audit(a.id, "LOGOUT");
    return { ok: true };
  }

  @Post("auth/recovery-email") async recoveryEmail(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      { email } = parse(
        z
          .object({ email: z.email().transform((s) => s.toLowerCase()) })
          .strict(),
        body,
      );
    const currentSession = await db.session.findUnique({
      where: { id: a.sid },
    });
    if (
      !currentSession ||
      currentSession.createdAt < new Date(Date.now() - 10 * 60000)
    )
      fail(
        "Đăng nhập lại trước khi thêm email khôi phục (phiên đăng nhập cần trong 10 phút gần nhất).",
        403,
      );
    if (email.endsWith("@accounts.invalid"))
      fail("Nhập email có thể nhận thư.");
    if (await db.user.findFirst({ where: { email, id: { not: a.id } } }))
      fail("Email đã thuộc tài khoản khác.", 409);
    const token = randomBytes(32).toString("hex");
    await db.oneTimeToken.create({
      data: {
        userId: a.id,
        tokenHash: hash(token),
        purpose: "RECOVERY_EMAIL",
        targetEmail: email,
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
    await sendAccountEmail(
      email,
      "Xác minh email khôi phục Tiên Truyện",
      `${origin}/bao-mat?recovery=${token}`,
    );
    return {
      message:
        "Đã gửi liên kết xác minh. Mở liên kết và đặt mật khẩu trong trang Bảo mật.",
      ...(!production ? { devRecoveryToken: token } : {}),
    };
  }
  @Post("auth/recovery-email/confirm") async confirmRecovery(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      data = parse(
        z
          .object({
            token: z.string().length(64),
            password: registerSchema.shape.password,
          })
          .strict(),
        body,
      );
    const passwordHash = await argon.hash(data.password, {
      type: argon.argon2id,
    });
    return serial(async (tx) => {
      const token = await tx.oneTimeToken.findUnique({
        where: { tokenHash: hash(data.token) },
      });
      if (
        !token ||
        token.userId !== a.id ||
        token.purpose !== "RECOVERY_EMAIL" ||
        !token.targetEmail ||
        token.usedAt ||
        token.expiresAt < new Date()
      )
        fail("Liên kết xác minh không hợp lệ hoặc hết hạn.");
      await tx.oneTimeToken.update({
        where: { id: token!.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: a.id },
        data: { email: token!.targetEmail!, emailVerified: true, passwordHash },
      });
      await tx.oneTimeToken.updateMany({
        where: { userId: a.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId: a.id, id: { not: a.sid }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit(a.id, "RECOVERY_EMAIL_CONFIRMED", undefined, tx);
      return {
        message:
          "Đã xác minh email và đặt mật khẩu. Bạn có thể đăng nhập bằng email này.",
      };
    });
  }

  @Post("auth/forgot-password") async forgot(@Body() body: unknown) {
    const { email } = parse(
      z.object({ email: z.email().transform((s) => s.toLowerCase()) }).strict(),
      body,
    );
    const u = await db.user.findUnique({ where: { email } });
    const generic = {
      message:
        "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi đến bạn.",
    };
    if (!u) return generic;
    const token = randomBytes(32).toString("hex");
    await db.oneTimeToken.create({
      data: {
        userId: u.id,
        tokenHash: hash(token),
        purpose: "RESET_PASSWORD",
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
    await sendAccountEmail(
      u.email,
      "Đặt lại mật khẩu Tiên Truyện",
      `${origin}/dat-lai-mat-khau?token=${token}`,
    );
    return { ...generic, ...(!production ? { devResetToken: token } : {}) };
  }
  @Post("auth/reset-password") async reset(@Body() body: unknown) {
    const data = parse(
      z
        .object({
          token: z.string().length(64),
          password: registerSchema.shape.password,
        })
        .strict(),
      body,
    );
    const passwordHash = await argon.hash(data.password, {
      type: argon.argon2id,
    });
    return serial(async (tx) => {
      const t = await tx.oneTimeToken.findUnique({
        where: { tokenHash: hash(data.token) },
      });
      if (
        !t ||
        t.usedAt ||
        t.expiresAt < new Date() ||
        t.purpose !== "RESET_PASSWORD"
      )
        fail("Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      await tx.oneTimeToken.update({
        where: { id: t!.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: t!.userId },
        data: { passwordHash },
      });
      await tx.session.updateMany({
        where: { userId: t!.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit(t!.userId, "RESET_PASSWORD", undefined, tx);
      return { ok: true };
    });
  }
  @Get("auth/sessions") async sessions(@Req() req: AuthRequest) {
    const a = auth(req);
    return db.session.findMany({
      where: { userId: a.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, device: true, createdAt: true },
    });
  }
  @Delete("auth/sessions/:id") async revoke(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    const a = auth(req);
    await db.session.updateMany({
      where: { id, userId: a.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
  @Get("avatars") avatars() {
    return avatarGallery;
  }
  @Put("users/avatar") async chooseAvatar(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req);
    const { avatar } = parse(
      z.object({ avatar: z.string().max(100) }).strict(),
      body,
    );
    if (!avatarGallery.includes(avatar))
      fail("Vui lòng chọn avatar trong thư viện.");
    await db.user.update({ where: { id: a.id }, data: { avatar } });
    return { avatar };
  }
  @Post("users/avatar/upload") async uploadAvatar(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req);
    const { image } = parse(
      z.object({ image: z.string().max(2800000) }).strict(),
      body,
    );
    if (!(await rateLimit(`avatar-upload:${a.id}`, 5, 3600)))
      fail("Bạn đã tải 5 ảnh trong một giờ. Hãy thử lại sau.", 429);
    let avatar: string;
    try {
      avatar = await storeAvatar(image);
    } catch (e) {
      fail(
        e instanceof Error && /Ảnh|ảnh|JPG|PNG|WebP/.test(e.message)
          ? e.message
          : "Không thể xử lý ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP hợp lệ.",
      );
    }
    await db.user.update({ where: { id: a.id }, data: { avatar: avatar! } });
    return { avatar: avatar! };
  }
  @Get("avatars/uploads/:file") async avatarFile(
    @Param("file") file: string,
    @Res() res: Response,
  ) {
    if (!/^[a-f0-9]{64}\.webp$/.test(file)) fail("Không tìm thấy ảnh.", 404);
    let bytes: Buffer;
    try {
      bytes = await readFile(join(avatarDirectory, file));
    } catch {
      fail("Không tìm thấy ảnh.", 404);
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(bytes!);
  }
  @Put("users/settings") async settings(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const a = auth(req),
      settings = parse(settingsSchema, body);
    await db.user.update({
      where: { id: a.id },
      data: { readerSettings: settings },
    });
    return { ok: true };
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
  @Get("wallet/transactions") async transactions(@Req() req: AuthRequest) {
    return db.walletTransaction.findMany({
      where: { userId: auth(req).id, type: { not: "BATCH_RECEIPT" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Post("wallet/orders") async order(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      { packageIndex } = parse(
        z.object({ packageIndex: z.number().int().min(0).max(4) }).strict(),
        body,
      ),
      key = `${a.id}:topup:${idempotency(req)}`;
    const mode = paymentProvider();
    if (mode !== "payos" && mode !== "local")
      fail("Cấu hình thanh toán không hợp lệ.", 503);
    if (mode === "payos" && !providerOptions().paymentReady)
      fail("Thanh toán chưa được kích hoạt.", 503);
    if (mode === "local" && !providerOptions().simulate)
      fail("Thanh toán chưa được kích hoạt.", 503);
    const order = await serial(async (tx) => {
      const previous = await tx.topupOrder.findUnique({
        where: { idempotencyKey: key },
      });
      if (previous) return previous;
      const config = await economy(tx),
        pack = config.packages[packageIndex];
      if (!pack) fail("Gói nạp không tồn tại.");
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const total = await tx.topupOrder.aggregate({
        where: {
          userId: a.id,
          createdAt: { gte: day },
          status: { in: ["PENDING", "PAID"] },
        },
        _sum: { amountVnd: true },
      });
      if ((total._sum.amountVnd || 0) + pack.amount > 20000000)
        fail("Đã đạt hạn mức nạp trong ngày.");
      const user = await tx.user.findUniqueOrThrow({ where: { id: a.id } });
      const level = levelFor(config.readerLevels, user.totalTopupVnd);
      return tx.topupOrder.create({
        data: {
          userId: a.id,
          provider: mode === "payos" ? "PAYOS" : "LOCAL",
          orderCode:
            mode === "payos" ? String(randomBytes(6).readUIntBE(0, 6)) : null,
          amountVnd: pack.amount,
          coinsBase: pack.base,
          coinsBonus: pack.bonus + Math.floor((pack.base * level[2]) / 100),
          idempotencyKey: key,
          expiresAt: new Date(Date.now() + 15 * 60000),
        },
      });
    });
    try {
      return await this.paymentLink(order);
    } catch {
      return { ...order, checkoutPending: true };
    }
  }
  async paymentState(
    order: Awaited<ReturnType<typeof db.topupOrder.findUniqueOrThrow>>,
  ) {
    if (order.provider !== "PAYOS" || !order.orderCode) return order;
    if (
      ["PAID", "CANCELLED", "NEEDS_REVIEW", "REFUNDED"].includes(order.status)
    )
      return order;
    const remote = await payos(`/v2/payment-requests/${order.orderCode}`);
    if (
      typeof remote.id !== "string" ||
      !remote.id ||
      remote.orderCode !== Number(order.orderCode) ||
      remote.amount !== order.amountVnd ||
      (order.paymentLinkId && remote.id !== order.paymentLinkId)
    )
      fail("Thông tin thanh toán không khớp.", 409);
    const reason = paymentReviewReason(
      order.amountVnd,
      order.expiresAt,
      remote.amountPaid,
      remote.amountRemaining,
    );
    if (remote.orderCode === Number(order.orderCode) && reason) {
      await db.topupOrder.updateMany({
        where: { id: order.id, status: { in: ["PENDING", "EXPIRED"] } },
        data: {
          status: "NEEDS_REVIEW",
          receivedVnd: remote.amountPaid,
          reviewReason: reason,
        },
      });
      return db.topupOrder.findUniqueOrThrow({ where: { id: order.id } });
    }
    if (
      remote.status === "PAID" &&
      remote.amountPaid >= order.amountVnd &&
      remote.amountRemaining === 0
    ) {
      await settle(order.id, `payos:${remote.id}`, order.amountVnd, true);
    } else if (remote.status === "CANCELLED" || remote.status === "EXPIRED") {
      await db.topupOrder.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: remote.status },
      });
    }
    if (
      remote.status === "PENDING" &&
      remote.amountPaid === 0 &&
      order.expiresAt < new Date()
    ) {
      await db.topupOrder.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
    }
    return db.topupOrder.findUniqueOrThrow({ where: { id: order.id } });
  }
  async paymentLink(
    order: Awaited<ReturnType<typeof db.topupOrder.findUniqueOrThrow>>,
  ) {
    if (
      order.provider !== "PAYOS" ||
      !order.orderCode ||
      order.status !== "PENDING" ||
      order.checkoutUrl
    )
      return order;
    if (order.expiresAt < new Date())
      return db.topupOrder.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
      });
    const data = {
      amount: order.amountVnd,
      cancelUrl: `${origin}/nap-hong-ngoc?order=${order.id}`,
      description: `TT${order.orderCode.slice(-7)}`,
      orderCode: Number(order.orderCode),
      returnUrl: `${origin}/nap-hong-ngoc?order=${order.id}`,
    };
    const created = await payos("/v2/payment-requests", {
      ...data,
      expiredAt: Math.floor(order.expiresAt.getTime() / 1000),
      signature: payosSignature(data, process.env.PAYOS_CHECKSUM_KEY!),
    });
    const checkout = parse(z.url(), created.checkoutUrl),
      url = new URL(checkout);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "pay.payos.vn" ||
      created.orderCode !== Number(order.orderCode) ||
      created.amount !== order.amountVnd ||
      typeof created.paymentLinkId !== "string"
    )
      fail("Liên kết thanh toán không hợp lệ.", 502);
    return db.topupOrder.update({
      where: { id: order.id },
      data: {
        checkoutUrl: checkout,
        paymentLinkId: created.paymentLinkId,
        qrCode: typeof created.qrCode === "string" ? created.qrCode : null,
      },
    });
  }
  @Get("wallet/orders") async myOrders(@Req() req: AuthRequest) {
    return db.topupOrder.findMany({
      where: { userId: auth(req).id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }
  @Get("wallet/orders/:id") async checkOrder(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    const order = await db.topupOrder.findFirst({
      where: { id, userId: auth(req).id },
    });
    if (!order) fail("Không tìm thấy đơn nạp.", 404);
    if (order.provider === "PAYOS") return this.paymentState(order);
    if (order.status === "PENDING" && order.expiresAt < new Date())
      return db.topupOrder.update({
        where: { id },
        data: { status: "EXPIRED" },
      });
    return order;
  }
  @Post("wallet/orders/:id/checkout") async retryCheckout(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    const order = await db.topupOrder.findFirst({
      where: { id, userId: auth(req).id },
    });
    if (!order) fail("Không tìm thấy đơn nạp.", 404);
    // Recover a provider-side link after a request timed out before our DB update.
    if (order.provider === "PAYOS" && order.orderCode && !order.checkoutUrl) {
      try {
        const existing = await payos(`/v2/payment-requests/${order.orderCode}`);
        if (
          existing.orderCode !== Number(order.orderCode) ||
          existing.amount !== order.amountVnd ||
          typeof existing.id !== "string"
        )
          fail("Đơn thanh toán không khớp.", 409);
        await db.topupOrder.update({
          where: { id },
          data: {
            paymentLinkId: existing.id,
            checkoutUrl: `https://pay.payos.vn/web/${encodeURIComponent(existing.id)}`,
          },
        });
      } catch (e) {
        if (e instanceof HttpException && e.getStatus() === 409) throw e;
      }
    }
    return this.paymentLink(
      await db.topupOrder.findUniqueOrThrow({ where: { id } }),
    );
  }
  @Post("wallet/orders/:id/cancel") async cancelOrder(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    const order = await db.topupOrder.findFirst({
      where: { id, userId: auth(req).id },
    });
    if (!order) fail("Không tìm thấy đơn nạp.", 404);
    if (order.status !== "PENDING") return order;
    if (order.provider === "PAYOS" && order.orderCode) {
      await payos(`/v2/payment-requests/${order.orderCode}/cancel`, {
        cancellationReason: "Khách hàng hủy đơn",
      });
      return this.paymentState(order);
    }
    await db.topupOrder.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    return db.topupOrder.findUniqueOrThrow({ where: { id } });
  }
  @Post("payments/payos/webhook") async payosWebhook(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(200);
    const message = parse(
      z
        .object({
          code: z.string(),
          success: z.boolean(),
          data: z.record(z.string(), z.unknown()),
          signature: z.string(),
        })
        .passthrough(),
      body,
    );
    if (!verifyPayos(message.data, message.signature))
      fail("Chữ ký payOS không hợp lệ.", 401);
    if (message.data.code !== "00" || message.data.currency !== "VND")
      return { ok: true };
    const data = parse(
      z
        .object({
          orderCode: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          amount: z.number().int().positive(),
          paymentLinkId: z.string().min(1).max(100),
        })
        .passthrough(),
      message.data,
    );
    const order = await db.topupOrder.findUnique({
      where: { orderCode: String(data.orderCode) },
    });
    // payOS sends a signed sample during webhook registration. Never credit unknown orders.
    if (!order) return { ok: true, ignored: true };
    if (
      order.provider !== "PAYOS" ||
      (order.paymentLinkId && order.paymentLinkId !== data.paymentLinkId)
    )
      fail("Đơn thanh toán không khớp.", 409);
    await this.paymentState(order);
    return { ok: true };
  }
  @Post("wallet/orders/:id/simulate") async simulate(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    if (
      !providerOptions().simulate || paymentProvider() !== "local"
    )
      fail("Nạp giả lập đang tắt.", 403);
    const a = auth(req);
    const order = await db.topupOrder.findFirst({
      where: { id, userId: a.id },
    });
    if (!order || order.provider !== "LOCAL")
      fail("Không tìm thấy đơn nạp.", 404);
    return settle(id, `dev-${id}`, order!.amountVnd);
  }
  @Post("payments/webhook") async webhook(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    if (production || paymentProvider() !== "local")
      fail("Webhook local đang tắt.", 404);
    const key = process.env.PAYMENT_WEBHOOK_SECRET,
      signature = req.headers["x-payment-signature"];
    if (
      !key ||
      key.length < 32 ||
      typeof signature !== "string" ||
      !validSignature(req.rawBody || Buffer.alloc(0), signature, key)
    )
      fail("Chữ ký không hợp lệ.", 401);
    const data = parse(
      z
        .object({
          orderId: z.string().min(1).max(100),
          providerTxnId: z.string().min(1).max(100),
          amountVnd: z.number().int().positive(),
        })
        .strict(),
      body,
    );
    return settle(data.orderId, data.providerTxnId, data.amountVnd);
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
  @Post("admin/payouts/:id") async reviewPayout(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const a = auth(req, "ADMIN");
    const { approve } = parse(
      z.object({ approve: z.boolean() }).strict(),
      body,
    );
    return serial(async (tx) => {
      const p = await tx.payoutRequest.findUnique({ where: { id } });
      if (!p || p.status !== "PENDING") fail("Yêu cầu không còn chờ xử lý.");
      await tx.payoutRequest.update({
        where: { id },
        data: { status: approve ? "PAID" : "REJECTED", reviewedBy: a.id },
      });
      await tx.authorEarning.updateMany({
        where: { authorId: p!.authorId, status: "RESERVED" },
        data: { status: approve ? "PAID_OUT" : "AVAILABLE" },
      });
      await audit(
        a.id,
        approve ? "PAYOUT_CONFIRMED" : "PAYOUT_REJECTED",
        id,
        tx,
      );
      return { ok: true };
    });
  }
  @Post("admin/refunds/:id") async refund(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    const a = auth(req, "ADMIN");
    return serial(async (tx) => {
      const purchase = await tx.chapterPurchase.findUnique({ where: { id } });
      if (!purchase) fail("Không tìm thấy lượt mua.", 404);
      const key = `refund:${id}`;
      if (
        await tx.walletTransaction.findUnique({
          where: { idempotencyKey: key },
        })
      )
        return { ok: true, duplicate: true };
      const earning = await tx.authorEarning.findUnique({
        where: { purchaseId: id },
      });
      if (!earning || earning.status !== "AVAILABLE")
        fail(
          "Khoản doanh thu đã được giữ hoặc chi trả. Cần đối soát thủ công.",
        );
      await tx.$queryRaw`SELECT "userId" FROM "Wallet" WHERE "userId" = ${purchase!.userId} FOR UPDATE`;
      const wallet = await tx.wallet.update({
        where: { userId: purchase!.userId },
        data: { balance: { increment: purchase!.pricePaid } },
      });
      await tx.walletTransaction.create({
        data: {
          userId: purchase!.userId,
          type: "REFUND",
          amount: purchase!.pricePaid,
          balanceAfter: wallet.balance,
          refId: id,
          idempotencyKey: key,
        },
      });
      await tx.authorEarning.update({
        where: { purchaseId: id },
        data: { status: "REFUNDED" },
      });
      await audit(a.id, "PURCHASE_REFUND", id, tx);
      return { ok: true };
    });
  }
  @Post("admin/reports/:id") async resolveReport(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const a = auth(req, "ADMIN");
    const { remove } = parse(z.object({ remove: z.boolean() }).strict(), body);
    return serial(async (tx) => {
      const report = await tx.report.findUnique({ where: { id } });
      if (!report || report.status !== "PENDING")
        fail("Báo cáo không còn chờ xử lý.");
      if (remove) {
        await tx.comment.updateMany({
          where: {
            OR: [{ id: report!.targetId }, { parentId: report!.targetId }],
          },
          data: { hidden: true },
        });
        await tx.chapter.updateMany({
          where: { id: report!.targetId },
          data: { hidden: true, countedForLevel: false },
        });
        await tx.story.updateMany({
          where: { id: report!.targetId },
          data: { status: "HIDDEN" },
        });
        await tx.chapter.updateMany({
          where: { storyId: report!.targetId },
          data: { countedForLevel: false },
        });
      }
      await tx.report.update({
        where: { id },
        data: { status: remove ? "CONFIRMED" : "DISMISSED" },
      });
      await audit(a.id, "REPORT_RESOLVED", id, tx);
      return { ok: true };
    });
  }
  @Put("admin/config") async updateConfig(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req, "ADMIN");
    const config = parse(
      z
        .object({
          exchangeRate: z.number().int().min(1).max(10000),
          minFreeChapters: z.number().int().min(1).max(100),
          minPrice: z.number().int().min(5).max(100),
          defaultPrice: z.number().int().min(5).max(100),
          minimumPayoutVnd: z.number().int().min(10000),
          packages: z
            .array(
              z
                .object({
                  name: z.string().min(1).max(30),
                  amount: z.number().int().min(10000).max(5000000),
                  base: z.number().int().positive().max(1000000),
                  bonus: z.number().int().min(0).max(1000000),
                })
                .strict(),
            )
            .length(5),
          readerLevels: z
            .array(
              z.tuple([
                z.string(),
                z.number().int().min(0),
                z.number().int().min(0).max(100),
              ]),
            )
            .min(1)
            .max(20),
          authorLevels: z
            .array(
              z.tuple([
                z.string(),
                z.number().int().min(0),
                z.number().int().min(5).max(100),
                z.number().int().min(1).max(20),
                z.number().int().min(0).max(100),
              ]),
            )
            .min(1)
            .max(20),
        })
        .strict(),
      body,
    );
    for (const levels of [config.readerLevels, config.authorLevels]) {
      if (
        levels[0][1] !== 0 ||
        levels.some((l, i) => i > 0 && l[1] <= levels[i - 1][1])
      )
        fail("Mốc cấp phải bắt đầu từ 0 và tăng dần.");
    }
    return serial(async (tx) => {
      await tx.systemConfig.update({
        where: { key: "economy" },
        data: { value: config },
      });
      await audit(a.id, "CONFIG_UPDATE", undefined, tx);
      return { ok: true };
    });
  }
  @Post("admin/topups/:id") async resolveTopup(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const a = auth(req, "ADMIN"),
      { action, note } = parse(
        z
          .object({
            action: z.enum(["CREDIT", "REFUNDED"]),
            note: z.string().trim().min(8).max(500),
          })
          .strict(),
        body,
      );
    const order = await db.topupOrder.findUniqueOrThrow({ where: { id } });
    if (order.status !== "NEEDS_REVIEW") fail("Đơn không chờ xử lý.", 409);
    if (action === "CREDIT") {
      const remote = await payos(`/v2/payment-requests/${order.orderCode}`);
      if (
        remote.id !== order.paymentLinkId ||
        remote.orderCode !== Number(order.orderCode) ||
        remote.amountPaid !== order.amountVnd ||
        remote.amountRemaining !== 0 ||
        remote.status !== "PAID"
      )
        fail(
          "Chỉ cộng ví khi payOS xác nhận đủ đúng số tiền. Đơn sai số tiền cần hoàn thủ công.",
          409,
        );
      await settle(id, `payos:${remote.id}`, order.amountVnd, true);
    } else {
      await db.topupOrder.updateMany({
        where: { id, status: "NEEDS_REVIEW" },
        data: { status: "REFUNDED", reviewReason: note },
      });
    }
    await audit(a.id, `TOPUP_REVIEW_${action}`, id);
    return { ok: true };
  }
  @Get("admin/:section") async adminList(
    @Req() req: AuthRequest,
    @Param("section") section: string,
  ) {
    auth(req, "ADMIN");
    switch (section) {
      case "topups":
        return db.topupOrder.findMany({
          where: { status: "NEEDS_REVIEW" },
          orderBy: { createdAt: "asc" },
          take: 100,
        });
      case "payouts":
        return db.payoutRequest.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
        });
      case "purchases":
        return db.chapterPurchase.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        });
      case "applications":
        return db.authorApplication.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
        });
      case "stories":
        return db.story.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
        });
      case "reports": {
        const reports = await db.report.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
          take: 100,
        });
        return Promise.all(
          reports.map(async (report) => {
            const comment = await db.comment.findUnique({
              where: { id: report.targetId },
              include: {
                user: { select: { name: true } },
                story: { select: { title: true, slug: true } },
              },
            });
            if (comment)
              return {
                ...report,
                context: {
                  title: `Bình luận của ${comment.user.name} · ${comment.story.title}`,
                  content: comment.content,
                  slug: comment.story.slug,
                },
              };
            const chapter = await db.chapter.findUnique({
              where: { id: report.targetId },
              include: { story: { select: { title: true, slug: true } } },
            });
            if (chapter)
              return {
                ...report,
                context: {
                  title: `${chapter.story.title} · Chương ${chapter.number}`,
                  content: chapter.content.slice(0, 3000),
                  slug: chapter.story.slug,
                },
              };
            const story = await db.story.findUnique({
              where: { id: report.targetId },
            });
            return {
              ...report,
              context: story
                ? {
                    title: story.title,
                    content: story.description,
                    slug: story.slug,
                  }
                : null,
            };
          }),
        );
      }
      case "users":
        return db.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            roles: true,
            createdAt: true,
          },
          take: 100,
        });
      case "transactions":
        return db.walletTransaction.findMany({
          take: 100,
          orderBy: { createdAt: "desc" },
        });
      case "audit":
        return db.auditLog.findMany({
          take: 100,
          orderBy: { createdAt: "desc" },
        });
      default:
        fail("Không tìm thấy mục quản trị.", 404);
    }
  }
  @Post("admin/review") async review(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req, "ADMIN");
    const data = parse(
      z
        .object({
          kind: z.enum(["application", "story"]),
          id: z.string().max(100),
          approve: z.boolean(),
          reason: z.string().max(2000).optional(),
        })
        .strict(),
      body,
    );
    if (!data.approve && !data.reason?.trim()) fail("Cần nhập lý do từ chối.");
    return serial(async (tx) => {
      if (data.kind === "application") {
        const app = await tx.authorApplication.findUnique({
          where: { id: data.id },
        });
        if (!app || app.status !== "PENDING")
          fail("Hồ sơ không còn chờ duyệt.");
        await tx.authorApplication.update({
          where: { id: data.id },
          data: {
            status: data.approve ? "APPROVED" : "REJECTED",
            rejectReason: data.reason,
            reviewedBy: a.id,
            reviewedAt: new Date(),
          },
        });
        if (data.approve) {
          const u = await tx.user.findUniqueOrThrow({
            where: { id: app!.userId },
          });
          await tx.user.update({
            where: { id: u.id },
            data: { roles: [...new Set([...u.roles, "AUTHOR"])] },
          });
        }
      } else {
        const s = await tx.story.findUnique({ where: { id: data.id } });
        if (!s || s.status !== "PENDING") fail("Truyện không còn chờ duyệt.");
        await tx.story.update({
          where: { id: data.id },
          data: {
            status: data.approve ? "APPROVED" : "REJECTED",
            rejectReason: data.reason,
          },
        });
      }
      await audit(a.id, data.approve ? "APPROVE" : "REJECT", data.id, tx);
      return { ok: true };
    });
  }
}
async function settle(
  id: string,
  providerTxnId: string,
  amountVnd: number,
  verifiedProvider = false,
) {
  return serial(async (tx) => {
    const order = await tx.topupOrder.findUnique({ where: { id } });
    if (!order) fail("Không tìm thấy đơn nạp.", 404);
    if (order!.amountVnd !== amountVnd) fail("Số tiền không khớp.");
    if (order!.status === "PAID") {
      if (order!.providerTxnId !== providerTxnId)
        fail("Giao dịch đã được xử lý bằng mã khác.", 409);
      return { ok: true, duplicate: true };
    }
    if (
      verifiedProvider
        ? !["PENDING", "EXPIRED", "NEEDS_REVIEW"].includes(order!.status)
        : order!.status !== "PENDING" || order!.expiresAt < new Date()
    )
      fail("Đơn nạp đã hết hạn hoặc không còn hiệu lực.");
    const providerUsed = await tx.topupOrder.findUnique({
      where: { providerTxnId },
    });
    if (providerUsed && providerUsed.id !== id)
      fail("Mã thanh toán đã được sử dụng.", 409);
    await tx.$queryRaw`SELECT "userId" FROM "Wallet" WHERE "userId" = ${order!.userId} FOR UPDATE`;
    const credit = order!.coinsBase + order!.coinsBonus;
    const wallet = await tx.wallet.update({
      where: { userId: order!.userId },
      data: { balance: { increment: credit } },
    });
    await tx.walletTransaction.create({
      data: {
        userId: order!.userId,
        type: "TOPUP",
        amount: order!.coinsBase,
        balanceAfter: wallet.balance - order!.coinsBonus,
        refId: id,
        idempotencyKey: `settle:${id}`,
      },
    });
    if (order!.coinsBonus > 0)
      await tx.walletTransaction.create({
        data: {
          userId: order!.userId,
          type: "BONUS",
          amount: order!.coinsBonus,
          balanceAfter: wallet.balance,
          refId: id,
          idempotencyKey: `settle-bonus:${id}`,
        },
      });
    await tx.user.update({
      where: { id: order!.userId },
      data: { totalTopupVnd: { increment: amountVnd } },
    });
    await tx.topupOrder.update({
      where: { id },
      data: { status: "PAID", providerTxnId },
    });
    await audit(order!.userId, "TOPUP", id, tx);
    return { ok: true, balance: wallet.balance };
  });
}
@Module({ controllers: [ApiController] })
class AppModule {}
const localLimits = new Map<string, { count: number; until: number }>();
async function rateLimit(key: string, limit: number, windowSeconds = 60) {
  if (redis) {
    const n = (await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      key,
      windowSeconds,
    )) as number;
    return n <= limit;
  }
  if (production) return false;
  const now = Date.now();
  if (localLimits.size > 10000)
    for (const [k, v] of localLimits) if (v.until < now) localLimits.delete(k);
  let item = localLimits.get(key);
  if (!item || item.until < now) {
    item = { count: 0, until: now + windowSeconds * 1000 };
    localLimits.set(key, item);
  }
  return ++item.count <= limit;
}
async function publishScheduledDrafts() {
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
async function reconcilePayments(controller: ApiController) {
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
async function ledgerCheck() {
  const rows = await db.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT COUNT(*)::bigint AS count FROM "Wallet" w LEFT JOIN (SELECT "userId", SUM(amount) AS total FROM "WalletTransaction" GROUP BY "userId") t ON t."userId"=w."userId" WHERE w.balance<>COALESCE(t.total,0)`;
  if (Number(rows[0]?.count) > 0)
    console.error("Wallet reconciliation mismatches:", Number(rows[0].count));
}
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.useBodyParser("json", { limit: "3mb" });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key"],
    methods: ["GET", "POST", "PUT", "DELETE"],
  });
  app.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      const authAction =
        /auth\/(login|register|forgot-password|recovery-email|phone|oauth)/.test(
          req.path,
        );
      const mutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      const bucket = authAction ? "auth" : mutation ? "write" : "read";
      if (
        !(await rateLimit(
          `rate:${req.ip}:${bucket}`,
          authAction ? 15 : mutation ? 60 : 150,
        ))
      )
        return res.status(429).json({
          message: "Bạn thao tác hơi nhanh. Hãy thử lại sau một phút.",
        });
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method),
        webhook = [
          "/api/payments/webhook",
          "/api/payments/payos/webhook",
        ].includes(req.path);
      if (mutating && !webhook) {
        if (!allowedOrigins.includes(req.headers.origin || ""))
          return res
            .status(403)
            .json({ message: "Nguồn yêu cầu không hợp lệ." });
        if (req.cookies.tt_access || req.cookies.tt_refresh) {
          const csrf = req.headers["x-csrf-token"];
          if (typeof csrf !== "string" || csrf !== req.cookies.tt_csrf)
            return res.status(403).json({
              message: "Mã bảo vệ phiên không hợp lệ. Hãy tải lại trang.",
            });
        }
      }
      if (req.cookies.tt_access) {
        try {
          const payload = jwt.verify(req.cookies.tt_access, secret, {
            issuer: "tientruyen",
            audience: "web",
            algorithms: ["HS256"],
          }) as { sub: string; sid: string };
          const s = await db.session.findUnique({
            where: { id: payload.sid },
            include: { user: { select: { roles: true } } },
          });
          if (
            s &&
            !s.revokedAt &&
            s.expiresAt > new Date() &&
            s.userId === payload.sub
          )
            req.identity = {
              id: payload.sub,
              sid: payload.sid,
              roles: s.user.roles,
            };
        } catch {}
      }
      next();
    } catch {
      res.status(503).json({ message: "Dịch vụ tạm thời chưa sẵn sàng." });
    }
  });
  // Functions may freeze between requests; cloud jobs are invoked by a scheduler.
  if (!process.env.VERCEL) {
    let publishing = false;
    const publishTimer = setInterval(async () => {
      if (publishing) return;
      publishing = true;
      try {
        await publishScheduledDrafts();
      } catch {
        console.warn("Scheduled publication temporarily unavailable.");
      } finally {
        publishing = false;
      }
    }, 30000);
    publishTimer.unref();
    let reconciling = false;
    const reconcileTimer = setInterval(async () => {
      if (reconciling) return;
      reconciling = true;
      try {
        if (
          redis &&
          !(await redis.set(
            "tt:payment-reconcile-lock",
            "worker",
            "EX",
            180,
            "NX",
          ))
        )
          return;
        await reconcilePayments(app.get(ApiController));
      } catch {
        console.warn("Payment reconciliation temporarily unavailable.");
      } finally {
        reconciling = false;
      }
    }, 180000);
    reconcileTimer.unref();
    const check = () =>
      ledgerCheck().catch(() =>
        console.warn("Wallet reconciliation temporarily unavailable."),
      );
    void check();
    const ledgerTimer = setInterval(() => void check(), 86400000);
    ledgerTimer.unref();
  }
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT) || 4000, "0.0.0.0");
}
void bootstrap();
