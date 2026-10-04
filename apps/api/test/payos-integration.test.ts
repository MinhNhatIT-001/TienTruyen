import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { payosSignature } from "../src/integrations/providers";

const base = process.env.PAYOS_INTEGRATION_URL;
test(
  "payOS: duplicate webhook, integrity, amount mismatch, cancel, expiry and recovery",
  { skip: !base },
  async () => {
    assert.match(
      process.env.DATABASE_URL || "",
      /tientruyen_payment_test/,
      "use the isolated Docker database only",
    );
    const db = new PrismaClient();
    const cookies = new Map<string, string>();
    const file = process.env.PAYOS_TEST_STATE!;
    const origin = "http://localhost:3000";
    function update(code: string, values: Record<string, unknown>) {
      const state = JSON.parse(readFileSync(file, "utf8"));
      Object.assign(state[code], values);
      writeFileSync(file, JSON.stringify(state));
    }
    async function call(
      path: string,
      method = "GET",
      body?: unknown,
      extra = {},
    ) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          "X-CSRF-Token": cookies.get("tt_csrf") || "",
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const c of r.headers.getSetCookie()) {
        const [k, v] = c.split(";")[0].split("=");
        cookies.set(k, v);
      }
      return { status: r.status, data: await r.json() };
    }
    async function order() {
      const key = randomUUID();
      const r = await call(
        "/wallet/orders",
        "POST",
        { packageIndex: 0 },
        { "Idempotency-Key": key },
      );
      assert.equal(r.status, 201);
      assert(r.data.checkoutUrl);
      assert(r.data.qrCode);
      const again = await call(
        "/wallet/orders",
        "POST",
        { packageIndex: 0 },
        { "Idempotency-Key": key },
      );
      assert.equal(again.data.id, r.data.id);
      return r.data;
    }
    async function webhook(o: any, valid = true) {
      const data = {
        orderCode: Number(o.orderCode),
        amount: o.amountVnd,
        paymentLinkId: o.paymentLinkId,
        code: "00",
        currency: "VND",
      };
      return call("/payments/payos/webhook", "POST", {
        code: "00",
        success: true,
        data,
        signature: valid
          ? payosSignature(data, process.env.PAYOS_CHECKSUM_KEY!)
          : "0".repeat(64),
      });
    }
    let userId: string | undefined;
    try {
      await db.systemConfig.upsert({
        where: { key: "economy" },
        update: {},
        create: {
          key: "economy",
          value: {
            packages: [{ name: "Test", amount: 20000, base: 200, bonus: 20 }],
            readerLevels: [["Phàm Nhân", 0, 0]],
          },
        },
      });
      const email = `payment-${randomUUID()}@example.invalid`,
        password = `Test-${randomUUID()}`;
      let r = await call("/auth/register", "POST", {
        name: "PaymentTester",
        email,
        password,
      });
      assert.equal(r.status, 201);
      userId = r.data.user?.id;
      r = await call("/auth/verify", "POST", { token: r.data.devVerifyToken });
      assert.equal(r.status, 201);
      r = await call("/auth/login", "POST", { email, password });
      assert.equal(r.status, 201);
      userId = (await call("/auth/me")).data.id;
      const paid = await order();
      assert.equal((await webhook(paid, false)).status, 401);
      assert.equal((await webhook(paid)).status, 200);
      assert.equal(
        (await call("/auth/me")).data.balance,
        0,
        "pending provider status never credits wallet",
      );
      update(paid.orderCode, {
        status: "PAID",
        amountPaid: paid.amountVnd,
        amountRemaining: 0,
      });
      const duplicates = await Promise.all([
        webhook(paid),
        webhook(paid),
        call(`/wallet/orders/${paid.id}`),
      ]);
      assert(duplicates.every((r) => r.status < 300));
      const balance = paid.coinsBase + paid.coinsBonus;
      assert.equal(
        (await call("/auth/me")).data.balance,
        balance,
        "concurrent callback and polling credit once",
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { refId: paid.id, type: "TOPUP" },
        }),
        1,
      );
      const partial = await order();
      update(partial.orderCode, {
        amountPaid: 1,
        amountRemaining: partial.amountVnd - 1,
      });
      assert.equal(
        (await call(`/wallet/orders/${partial.id}`)).data.status,
        "NEEDS_REVIEW",
      );
      assert.equal((await call("/auth/me")).data.balance, balance);
      const cancelled = await order();
      assert.equal(
        (await call(`/wallet/orders/${cancelled.id}/cancel`, "POST")).data
          .status,
        "CANCELLED",
      );
      const expired = await order();
      await db.topupOrder.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(Date.now() - 60000) },
      });
      assert.equal(
        (await call(`/wallet/orders/${expired.id}`)).data.status,
        "EXPIRED",
      );
      const late = await order();
      await db.topupOrder.update({
        where: { id: late.id },
        data: { expiresAt: new Date(Date.now() - 60000) },
      });
      update(late.orderCode, {
        status: "PAID",
        amountPaid: late.amountVnd,
        amountRemaining: 0,
      });
      assert.equal(
        (await call(`/wallet/orders/${late.id}`)).data.status,
        "NEEDS_REVIEW",
      );
      const recovery = await order();
      await db.topupOrder.update({
        where: { id: recovery.id },
        data: { checkoutUrl: null, paymentLinkId: null },
      });
      assert.equal(
        (await call(`/wallet/orders/${recovery.id}/checkout`, "POST")).data
          .checkoutUrl,
        recovery.checkoutUrl,
      );
      assert.equal((await call("/auth/me")).data.balance, balance);
    } finally {
      await db.$disconnect();
    }
  },
);
