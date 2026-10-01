import "reflect-metadata";
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
import {
  base32,
  encrypt,
  decrypt,
  verifyTotp,
  sendAccountEmail,
} from "./security";
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
  (!process.env.TOTP_ENCRYPTION_KEY ||
    process.env.TOTP_ENCRYPTION_KEY.length < 32 ||
    process.env.TOTP_ENCRYPTION_KEY.includes("replace-") ||
    process.env.TOTP_ENCRYPTION_KEY.includes("development-"))
)
  throw new Error(
    "Production requires an independent random TOTP encryption key",
  );
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
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
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
async function requireMfa(id: string) {
  const u = await db.user.findUniqueOrThrow({
    where: { id },
    select: { twoFactorSecret: true },
  });
  if (!u.twoFactorSecret)
    fail(
      "Bật xác thực hai bước trong trang Bảo mật trước khi thực hiện thao tác đặc quyền.",
      403,
    );
}
async function storyOwner(req: AuthRequest, id: string) {
  const user = auth(req, "AUTHOR");
  await requireMfa(user.id);
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
@Controller("api")
class ApiController {
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
    return rows.map(({ _count, ratings, ...s }) => ({
      ...s,
      chapterCount: _count.chapters,
      rating: ratings.length
        ? ratings.reduce((n, r) => n + r.score, 0) / ratings.length
        : 0,
      readers: 0,
    }));
  }
  @Get("stories/:slug") async story(@Param("slug") slug: string) {
    const s = await db.story.findFirst({
      where: { slug, status: "APPROVED" },
      include: {
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
          take: 50,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            content: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        },
      },
    });
    if (!s) fail("Không tìm thấy truyện.", 404);
    return s;
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
      if (req.identity)
        await db.readingProgress.upsert({
          where: {
            userId_storyId: { userId: req.identity.id, storyId: c!.storyId },
          },
          update: { chapter: n },
          create: { userId: req.identity.id, storyId: c!.storyId, chapter: n },
        });
      return { ...c, ...content, owned: !!purchased };
    }
    return c;
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
    const { email, password, code } = parse(loginSchema, body);
    if (!(await rateLimit(`login:account:${hash(email)}`, 10, 900))) {
      res.setHeader("Retry-After", "900");
      fail("Đã vượt số lần đăng nhập. Vui lòng thử lại sau 15 phút.", 429);
    }
    const u = await db.user.findUnique({ where: { email } });
    if (!u || !(await argon.verify(u.passwordHash, password)))
      fail("Email hoặc mật khẩu không chính xác.", 401);
    if (!u.emailVerified)
      fail("Vui lòng xác minh email trước khi đăng nhập.", 403);
    if (u.twoFactorSecret) {
      const counter = verifyTotp(
        decrypt(u.twoFactorSecret),
        code || "",
        u.twoFactorLastCounter,
      );
      if (counter === null) fail("Cần mã xác thực 2FA hợp lệ.", 401);
      const accepted = await db.user.updateMany({
        where: { id: u.id, twoFactorLastCounter: { lt: counter! } },
        data: { twoFactorLastCounter: counter! },
      });
      if (!accepted.count) fail("Mã 2FA đã được sử dụng.", 401);
    }
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
        roles: true,
        emailVerified: true,
        twoFactorSecret: true,
        totalTopupVnd: true,
        readerSettings: true,
        wallet: { select: { balance: true } },
      },
    });
    return {
      ...u,
      balance: u?.wallet?.balance || 0,
      wallet: undefined,
      twoFactorEnabled: !!u?.twoFactorSecret,
      twoFactorSecret: undefined,
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

  @Post("auth/2fa/setup") async setupMfa(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req);
    const { password } = parse(
      z.object({ password: z.string().max(128) }).strict(),
      body,
    );
    const u = await db.user.findUniqueOrThrow({ where: { id: a.id } });
    if (!(await argon.verify(u.passwordHash, password)))
      fail("Mật khẩu không chính xác.", 401);
    if (u.twoFactorSecret) fail("2FA đã được bật.");
    const secret = base32(randomBytes(20));
    await db.user.update({
      where: { id: a.id },
      data: { twoFactorPending: encrypt(secret) },
    });
    return {
      secret,
      uri: `otpauth://totp/TienTruyen:${encodeURIComponent(u.email)}?secret=${secret}&issuer=TienTruyen&algorithm=SHA1&digits=6&period=30`,
    };
  }
  @Post("auth/2fa/enable") async enableMfa(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      { code } = parse(
        z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
        body,
      );
    return serial(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: a.id } });
      if (!u.twoFactorPending) fail("Hãy khởi tạo 2FA trước.");
      const counter = verifyTotp(decrypt(u.twoFactorPending!), code, 0);
      if (counter === null) fail("Mã xác thực không chính xác.");
      await tx.user.update({
        where: { id: a.id },
        data: {
          twoFactorSecret: u.twoFactorPending,
          twoFactorPending: null,
          twoFactorLastCounter: counter!,
        },
      });
      await tx.session.updateMany({
        where: { userId: a.id, id: { not: a.sid }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit(a.id, "ENABLE_2FA", undefined, tx);
      return { ok: true };
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
  ) {
    const a = auth(req),
      key = `${a.id}:buy:${idempotency(req)}`;
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
      where: { userId: auth(req).id },
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
    return serial(async (tx) => {
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
          amountVnd: pack.amount,
          coinsBase: pack.base,
          coinsBonus: pack.bonus + Math.floor((pack.base * level[2]) / 100),
          idempotencyKey: key,
          expiresAt: new Date(Date.now() + 15 * 60000),
        },
      });
    });
  }
  @Post("wallet/orders/:id/simulate") async simulate(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    if (production || process.env.DEV_TOPUP_ENABLED !== "true")
      fail("Nạp giả lập đang tắt.", 403);
    const a = auth(req);
    const order = await db.topupOrder.findFirst({
      where: { id, userId: a.id },
    });
    if (!order) fail("Không tìm thấy đơn nạp.", 404);
    return settle(id, `dev-${id}`, order!.amountVnd);
  }
  @Post("payments/webhook") async webhook(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
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
    return Promise.all(
      rows.map(async (r) => ({
        ...r,
        story: await db.story.findFirst({
          where: { id: r.storyId, status: "APPROVED" },
          select: { title: true, slug: true },
        }),
      })),
    );
  }
  @Post("stories/:id/comments") async comment(
    @Req() req: AuthRequest,
    @Param("id") storyId: string,
    @Body() body: unknown,
  ) {
    const a = auth(req),
      { content } = parse(
        z.object({ content: z.string().trim().min(1).max(2000) }).strict(),
        body,
      );
    if (
      !(await db.story.findFirst({
        where: { id: storyId, status: "APPROVED" },
      }))
    )
      fail("Không tìm thấy truyện.", 404);
    return db.comment.create({ data: { userId: a.id, storyId, content } });
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
    await requireMfa(a.id);
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
    const story = await storyOwner(req, id);
    if (story.status !== "APPROVED")
      fail("Truyện cần được duyệt trước khi đăng chương.");
    const a = auth(req),
      data = parse(
        z
          .object({
            title: z.string().trim().min(2).max(150),
            content: z.string().trim().min(100).max(200000),
            isFree: z.boolean(),
            price: z.number().int().min(0).max(100),
          })
          .strict(),
        body,
      );
    return serial(async (tx) => {
      const config = await economy(tx),
        tier = await authorTier(a.id, tx);
      const latest = await tx.chapter.aggregate({
        where: { storyId: id },
        _max: { number: true },
      });
      const number = (latest._max.number || 0) + 1;
      if (number <= config.minFreeChapters && !data.isFree)
        fail(`Ít nhất ${config.minFreeChapters} chương đầu phải miễn phí.`);
      if (
        !data.isFree &&
        (data.price < config.minPrice || data.price > tier[2])
      )
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
            story: { authorId: a.id },
            countedForLevel: true,
            publishedAt: { gte: day },
          },
        });
      const c = await tx.chapter.create({
        data: {
          ...data,
          price: data.isFree ? 0 : data.price,
          storyId: id,
          number,
          wordCount: words,
          contentHash,
          countedForLevel: words >= 1000 && !duplicate && daily < 5,
        },
      });
      await tx.story.update({ where: { id }, data: { updatedAt: new Date() } });
      await audit(a.id, "CHAPTER_PUBLISH", c.id, tx);
      return { id: c.id, number: c.number };
    });
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
    await requireMfa(a.id);
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
    await requireMfa(a.id);
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
    await requireMfa(a.id);
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
    await requireMfa(a.id);
    const { remove } = parse(z.object({ remove: z.boolean() }).strict(), body);
    return serial(async (tx) => {
      const report = await tx.report.findUnique({ where: { id } });
      if (!report || report.status !== "PENDING")
        fail("Báo cáo không còn chờ xử lý.");
      if (remove) {
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
    await requireMfa(a.id);
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
  @Get("admin/:section") async adminList(
    @Req() req: AuthRequest,
    @Param("section") section: string,
  ) {
    await requireMfa(auth(req, "ADMIN").id);
    switch (section) {
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
      case "reports":
        return db.report.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
        });
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
    await requireMfa(a.id);
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
async function settle(id: string, providerTxnId: string, amountVnd: number) {
  return serial(async (tx) => {
    const order = await tx.topupOrder.findUnique({ where: { id } });
    if (!order) fail("Không tìm thấy đơn nạp.", 404);
    if (order!.amountVnd !== amountVnd) fail("Số tiền không khớp.");
    if (order!.status === "PAID") {
      if (order!.providerTxnId !== providerTxnId)
        fail("Giao dịch đã được xử lý bằng mã khác.", 409);
      return { ok: true, duplicate: true };
    }
    if (order!.status !== "PENDING" || order!.expiresAt < new Date())
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
        amount: credit,
        balanceAfter: wallet.balance,
        refId: id,
        idempotencyKey: `settle:${id}`,
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
      const authAction = /auth\/(login|register|forgot-password|2fa)/.test(
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
        webhook = req.path === "/api/payments/webhook";
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
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT) || 4000, "0.0.0.0");
}
void bootstrap();
