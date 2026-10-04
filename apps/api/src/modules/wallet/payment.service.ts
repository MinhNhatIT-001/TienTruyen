import { paymentReviewReason } from "./payment-policy";
import { payos, payosSignature } from "../../integrations/providers";

import { z } from "zod";

import { db } from "../../database/prisma";
import { origin } from "../../config/environment";
import { fail, parse } from "../../common/http";

import { settle } from "./settlement.service";
export async function paymentState(
  order: Awaited<ReturnType<typeof db.topupOrder.findUniqueOrThrow>>,
) {
  if (order.provider !== "PAYOS" || !order.orderCode) return order;
  if (["PAID", "CANCELLED", "NEEDS_REVIEW", "REFUNDED"].includes(order.status))
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

export async function paymentLink(
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
