import { payos } from "../../integrations/providers";
import { Controller, Get, Post, Put, Param, Body, Req } from "@nestjs/common";
import { z } from "zod";
import { db } from "../../database/prisma";
import { fail, parse, AuthRequest, auth } from "../../common/http";
import { audit } from "../../common/audit";
import { serial } from "../../database/transaction";
import { settle } from "../wallet/settlement.service";
@Controller("api")
export class AdminController {
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
      case "summary": {
        const [
          users,
          stories,
          applications,
          reports,
          topups,
          payouts,
          scheduled,
        ] = await Promise.all([
          db.user.count(),
          db.story.count({ where: { status: "PENDING" } }),
          db.authorApplication.count({ where: { status: "PENDING" } }),
          db.report.count({ where: { status: "PENDING" } }),
          db.topupOrder.count({ where: { status: "NEEDS_REVIEW" } }),
          db.payoutRequest.count({ where: { status: "PENDING" } }),
          db.chapterDraft.count({ where: { status: "SCHEDULED" } }),
        ]);
        return {
          users,
          stories,
          applications,
          reports,
          topups,
          payouts,
          scheduled,
        };
      }
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
