import { paymentState, paymentLink } from "./payment.service";

import {
  providerOptions,
  paymentProvider,
  payos,
  verifyPayos,
} from "../../integrations/providers";
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  HttpException,
} from "@nestjs/common";
import type { Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { validSignature, levelFor } from "../../common/policy";
import { db } from "../../database/prisma";
import { production } from "../../config/environment";
import { fail, parse, AuthRequest, auth, idempotency } from "../../common/http";
import { economy } from "./economy.service";
import { serial } from "../../database/transaction";
import { settle } from "./settlement.service";
@Controller("api")
export class WalletController {
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
      return await paymentLink(order);
    } catch {
      return { ...order, checkoutPending: true };
    }
  }

  @Get("wallet/orders") async myOrders(@Req() req: AuthRequest) {
    const userId = auth(req).id;
    // Only simulated orders can expire locally; real payments need provider reconciliation.
    await db.topupOrder.updateMany({
      where: {
        userId,
        provider: "LOCAL",
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });
    return db.topupOrder.findMany({
      where: { userId },
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
    if (order.provider === "PAYOS") return paymentState(order);
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
    return paymentLink(
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
      return paymentState(order);
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
    await paymentState(order);
    return { ok: true };
  }

  @Post("wallet/orders/:id/simulate") async simulate(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    if (!providerOptions().simulate || paymentProvider() !== "local")
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
}
