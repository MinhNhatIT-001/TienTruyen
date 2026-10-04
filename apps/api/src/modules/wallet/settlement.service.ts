import { fail } from "../../common/http";
import { audit } from "../../common/audit";
import { serial } from "../../database/transaction";
export async function settle(
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
