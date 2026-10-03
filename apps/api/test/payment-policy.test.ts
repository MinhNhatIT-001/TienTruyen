import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentReviewReason } from "../src/payment-policy";
test("payment review separates unpaid, correct, partial, excessive and late payments", () => {
  const now = new Date("2026-10-03T00:00:00Z"),
    future = new Date(now.getTime() + 60000),
    past = new Date(now.getTime() - 60000);
  assert.equal(paymentReviewReason(20000, future, 0, 20000, now), null);
  assert.equal(paymentReviewReason(20000, future, 20000, 0, now), null);
  assert.ok(paymentReviewReason(20000, future, 10000, 10000, now));
  assert.ok(paymentReviewReason(20000, future, 30000, 0, now));
  assert.ok(paymentReviewReason(20000, past, 20000, 0, now));
  assert.throws(() => paymentReviewReason(20000, future, NaN, 0, now));
  assert.throws(() => paymentReviewReason(20000, future, 20000, -1, now));
});
