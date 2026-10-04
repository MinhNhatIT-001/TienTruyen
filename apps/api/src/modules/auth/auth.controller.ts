import {
  providerOptions,
  normalizePhone,
  smsVerification,
  oauthUrl,
  oauthIdentity,
  OAuthProvider,
} from "../../integrations/providers";
import { randomAvatar } from "../users/avatar.service";
import { join } from "path";
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
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as argon from "argon2";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { sendAccountEmail } from "./email.service";
import { db } from "../../database/prisma";
import { production, secret, origin } from "../../config/environment";
import { hash, fail, parse, AuthRequest, auth } from "../../common/http";
import { audit } from "../../common/audit";
import { serial } from "../../database/transaction";
import {
  cookies,
  session,
  registerSchema,
  loginSchema,
} from "./session.service";
import { rateLimit } from "../../common/rate-limit";
@Controller("api")
export class AuthController {
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
      return res.redirect(`${origin}/dang-nhap/hoan-tat${p.linkUser ? "?link=1" : ""}`);
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
}
