import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  splitRevenue,
  validSignature,
  canRead,
  wordCount,
  levelFor,
  safeNext,
} from "../src/policy";
test("paid chapter is unavailable to guests and non-purchasers", () => {
  assert.equal(canRead(false, false), false);
  assert.equal(canRead(false, true), true);
  assert.equal(canRead(true, false), true);
});
test("integer author and platform shares preserve total", () => {
  for (let p = 5; p <= 100; p++)
    for (const r of [70, 72, 74, 76, 78, 80]) {
      const s = splitRevenue(p, r);
      assert.equal(s.author + s.platform, p);
      assert(Number.isInteger(s.author));
    }
  assert.throws(() => splitRevenue(1.5, 70));
  assert.throws(() => splitRevenue(-1, 70));
});
test("signed webhook rejects changed bytes and invalid signatures", () => {
  const body = Buffer.from('{"amountVnd":20000}'),
    secret = "test-secret",
    sig = createHmac("sha256", secret).update(body).digest("hex");
  assert(validSignature(body, sig, secret));
  assert(!validSignature(Buffer.from('{"amountVnd":50000}'), sig, secret));
  assert(!validSignature(body, "bad", secret));
});
test("levels use lifetime topups and exact boundary", () => {
  const levels = [
    ["Phàm Nhân", 0],
    ["Luyện Khí", 50000],
  ];
  assert.equal(levelFor(levels, 49999)[0], "Phàm Nhân");
  assert.equal(levelFor(levels, 50000)[0], "Luyện Khí");
});
test("word counts normalize whitespace", () => {
  assert.equal(wordCount("  một   hai\n ba  "), 3);
  assert.equal(wordCount(""), 0);
});
test("return paths reject external redirects", () => {
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("/\\evil.example"), "/");
  assert.equal(safeNext("/truyen/van-dao/6"), "/truyen/van-dao/6");
});

import { base32, totp, verifyTotp } from "../src/security";
test("TOTP follows RFC 6238 SHA-1 test vector and rejects replay", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  assert.equal(totp(secret, 1, 8), "94287082");
  const code = totp(secret, 1);
  assert.equal(verifyTotp(secret, code, 0, 59000), 1);
  assert.equal(verifyTotp(secret, code, 1, 59000), null);
  assert.equal(verifyTotp(secret, "abcdef", 0, 59000), null);
});
