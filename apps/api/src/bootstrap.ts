import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { AppModule } from "./app.module";
import { paymentState } from "./modules/wallet/payment.service";
import { db } from "./database/prisma";
import { secret, origin, allowedOrigins } from "./config/environment";
import { redis, rateLimit } from "./common/rate-limit";
import { AuthRequest } from "./common/http";
import { cookies, session } from "./modules/auth/session.service";
import {
  publishScheduledDrafts,
  reconcilePayments,
  ledgerCheck,
} from "./modules/jobs/jobs.service";
export async function bootstrap() {
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
        await reconcilePayments({ paymentState });
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
