export function paymentReviewReason(
  expected: number,
  expiresAt: Date,
  paid: number,
  remaining: number,
  now = new Date(),
) {
  if (
    !Number.isSafeInteger(paid) ||
    paid < 0 ||
    !Number.isSafeInteger(remaining) ||
    remaining < 0
  )
    throw new Error("Invalid provider payment amount");
  if (paid === 0) return null;
  if (paid !== expected || remaining !== 0)
    return "Số tiền nhận không khớp hoặc chưa đủ";
  if (expiresAt < now)
    return "Thanh toán được xác nhận sau thời hạn, cần đối soát";
  return null;
}
