import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
const base = process.env.INTEGRATION_URL;
test(
  "PostgreSQL integration: auth, access control, concurrency, webhook integrity and refresh replay",
  { skip: !base },
  async () => {
    const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3000";
    const cookies = new Map<string, string>();
    async function call(
      path: string,
      method = "GET",
      body?: unknown,
      extra: Record<string, string> = {},
      authenticated = true,
    ) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(authenticated
            ? {
                Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
                "X-CSRF-Token": cookies.get("tt_csrf") || "",
              }
            : {}),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (authenticated)
        for (const c of r.headers.getSetCookie()) {
          const [k, v] = c.split(";")[0].split("=");
          cookies.set(k, v);
        }
      const data = await r.json();
      return { status: r.status, data };
    }
    const email = `integration-${randomUUID()}@example.invalid`,
      password = `Test-${randomUUID()}`;
    const tooLong = await call("/auth/register", "POST", {
      name: "IntegrationTests",
      email: `name-limit-${randomUUID()}@example.invalid`,
      password,
    });
    assert.equal(
      tooLong.status,
      400,
      "registration rejects more than 15 characters",
    );
    const tooShort = await call("/auth/register", "POST", {
      name: "Test123",
      email: `short-name-${randomUUID()}@example.invalid`,
      password,
    });
    assert.equal(
      tooShort.status,
      400,
      "registration rejects fewer than 8 characters",
    );
    let r = await call("/auth/register", "POST", {
      name: "IntegrationTest",
      email,
      password,
    });
    assert.equal(r.status, 201);
    r = await call("/auth/verify", "POST", { token: r.data.devVerifyToken });
    assert.equal(r.status, 201);
    r = await call("/auth/login", "POST", { email, password });
    assert.equal(r.status, 201);
    assert(cookies.get("tt_access"));
    assert(cookies.get("tt_refresh"));
    const gallery = await call("/avatars");
    assert.equal(gallery.data.length, 11);
    r = await call("/auth/me");
    assert(
      gallery.data.includes(r.data.avatar),
      "new accounts receive a gallery avatar",
    );
    r = await call("/users/avatar", "PUT", {
      avatar: "https://example.invalid/image.svg",
    });
    assert.equal(r.status, 400, "arbitrary avatar URLs are rejected");
    r = await call("/users/avatar", "PUT", { avatar: gallery.data[1] });
    assert.equal(r.status, 200);
    assert.equal((await call("/auth/me")).data.avatar, gallery.data[1]);
    r = await call("/users/avatar/upload", "POST", {
      image: Buffer.from("<svg>bad</svg>").toString("base64"),
    });
    assert.equal(r.status, 400, "SVG masquerading as an avatar is rejected");
    const avatarBytes = await readFile(
      resolve(__dirname, "../../web/public/avatars/avatar-01.webp"),
    );
    r = await call("/users/avatar/upload", "POST", {
      image: avatarBytes.toString("base64"),
    });
    assert.equal(r.status, 201);
    const avatarImage = await fetch(
      base!.replace(/\/api$/, "") + r.data.avatar,
    );
    assert.equal(avatarImage.status, 200);
    assert.equal(avatarImage.headers.get("content-type"), "image/webp");
    assert.equal((await call("/auth/me")).data.avatar, r.data.avatar);

    r = await call("/admin/users");
    assert.equal(r.status, 403, "reader cannot access admin");
    r = await call("/stories/van-dao-truong-sinh/chapters/6");
    assert.equal(r.status, 200);
    assert.equal(r.data.content, undefined, "paid text must never leak");
    const chapterId = r.data.id;
    r = await call(`/purchases/${chapterId}`, "POST", undefined, {
      "Idempotency-Key": randomUUID(),
    });
    assert.equal(r.status, 402);
    r = await call(
      "/wallet/orders",
      "POST",
      { packageIndex: 0 },
      { "Idempotency-Key": randomUUID(), "X-CSRF-Token": "wrong" },
    );
    assert.equal(r.status, 403, "CSRF rejected");
    r = await call(
      "/wallet/orders",
      "POST",
      { packageIndex: 0 },
      { "Idempotency-Key": randomUUID() },
    );
    assert.equal(r.status, 201);
    const orderId = r.data.id;
    r = await call(`/wallet/orders/${orderId}/simulate`, "POST");
    assert.equal(r.status, 201);
    assert.equal(r.data.balance, 200);
    r = await call(`/wallet/orders/${orderId}/simulate`, "POST");
    assert.equal(r.data.duplicate, true);
    const buys = await Promise.all(
      Array.from({ length: 6 }, () =>
        call(`/purchases/${chapterId}`, "POST", undefined, {
          "Idempotency-Key": randomUUID(),
        }),
      ),
    );
    for (const result of buys)
      assert.equal(result.status, 201, JSON.stringify(result));
    r = await call("/auth/me");
    assert.equal(r.data.balance, 180, "concurrent requests debit only once");
    r = await call("/stories/van-dao-truong-sinh/chapters/6");
    assert.equal(typeof r.data.content, "string");
    r = await call(
      "/stories/van-dao-truong-sinh/chapters/6",
      "GET",
      undefined,
      {},
      false,
    );
    assert.equal(
      r.data.content,
      undefined,
      "guest cannot reuse purchased content",
    );
    r = await call("/wallet/transactions");
    assert.equal(r.data.filter((t: any) => t.type === "PURCHASE").length, 1);
    assert.equal(r.data.filter((t: any) => t.type === "TOPUP").length, 1);
    r = await call(
      "/payments/webhook",
      "POST",
      { orderId, providerTxnId: "fake", amountVnd: 20000 },
      { "X-Payment-Signature": "fake" },
      false,
    );
    assert.equal(r.status, 401);
    if (process.env.PAYMENT_WEBHOOK_SECRET) {
      const pending = await call(
        "/wallet/orders",
        "POST",
        { packageIndex: 0 },
        { "Idempotency-Key": randomUUID() },
      );
      assert.equal(pending.status, 201);
      const payload = {
        orderId: pending.data.id,
        providerTxnId: `signed-${randomUUID()}`,
        amountVnd: 20000,
      };
      const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest("hex");
      r = await call(
        "/payments/webhook",
        "POST",
        payload,
        { "X-Payment-Signature": signature },
        false,
      );
      assert.equal(r.status, 201, JSON.stringify(r));
      r = await call(
        "/payments/webhook",
        "POST",
        payload,
        { "X-Payment-Signature": signature },
        false,
      );
      assert.equal(r.data.duplicate, true);
      r = await call("/auth/me");
      assert.equal(
        r.data.balance,
        380,
        "duplicate signed webhook credits once",
      );
    }
    const detail = await call("/stories/van-dao-truong-sinh");
    const storyId = detail.data.id;
    assert.equal(
      (await call("/admin/users", "GET", undefined, {}, false)).status,
      401,
    );
    r = await call(`/library/${storyId}`, "PUT", {
      shelf: "FAVORITE",
      followed: true,
    });
    assert.equal(r.status, 200);
    assert.equal(
      (await call("/library")).data.find((x: any) => x.storyId === storyId)
        .followed,
      true,
    );
    r = await call("/reading/van-dao-truong-sinh/6", "PUT", {
      position: 0.62,
      finished: false,
    });
    assert.equal(r.status, 200);
    assert.equal(
      (await call("/stories/van-dao-truong-sinh/chapters/6")).data.position,
      0.62,
    );
    assert.equal(
      (
        await call("/reading/van-dao-truong-sinh/7", "PUT", {
          position: 1,
          finished: true,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/reading/van-dao-truong-sinh/6", "PUT", {
          position: 1.2,
          finished: false,
        })
      ).status,
      400,
    );
    const root = await call(`/stories/${storyId}/comments`, "POST", {
      content: "Cảm nhận kiểm thử của độc giả.",
    });
    assert.equal(root.status, 201);
    const reply = await call(`/stories/${storyId}/comments`, "POST", {
      content: "Trả lời bình luận kiểm thử.",
      parentId: root.data.id,
    });
    assert.equal(reply.status, 201);
    assert.equal(
      (
        await call(`/stories/${storyId}/comments`, "POST", {
          content: "Không lồng thêm một cấp.",
          parentId: reply.data.id,
        })
      ).status,
      404,
    );
    assert.equal(
      (await call(`/comments/${root.data.id}`, "DELETE")).status,
      200,
    );
    assert(
      !(await call("/stories/van-dao-truong-sinh")).data.comments.some(
        (c: any) => [root.data.id, reply.data.id].includes(c.id),
      ),
    );
    const extra = detail.data.chapters.filter(
      (c: any) => c.number === 7 || c.number === 8,
    );
    assert.equal(extra.length, 2);
    const total = extra.reduce((n: number, c: any) => n + c.price, 0),
      ids = extra.map((c: any) => c.id);
    const beforeBatch = (await call("/auth/me")).data.balance;
    assert.equal(
      (
        await call(
          "/purchases/batch",
          "POST",
          { chapterIds: ids, expectedTotal: total + 1 },
          { "Idempotency-Key": randomUUID() },
        )
      ).status,
      409,
    );
    assert.equal((await call("/auth/me")).data.balance, beforeBatch);
    const batchKey = randomUUID(),
      payload = { chapterIds: [...ids, ids[0]], expectedTotal: total };
    r = await call("/purchases/batch", "POST", payload, {
      "Idempotency-Key": batchKey,
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    assert.equal(r.data.count, 2);
    r = await call("/purchases/batch", "POST", payload, {
      "Idempotency-Key": batchKey,
    });
    assert.equal(r.data.alreadyPurchased, true);
    assert.equal((await call("/auth/me")).data.balance, beforeBatch - total);
    assert.equal(
      (
        await call(
          "/purchases/batch",
          "POST",
          { ...payload, expectedTotal: 0 },
          { "Idempotency-Key": batchKey },
        )
      ).status,
      409,
    );
    assert(
      (await call("/purchases")).data.some((p: any) => p.chapterId === ids[0]),
    );
    const oldRefresh = cookies.get("tt_refresh")!;
    r = await call("/auth/refresh", "POST");
    assert.equal(r.status, 201);
    const newRefresh = cookies.get("tt_refresh")!;
    assert.notEqual(oldRefresh, newRefresh);
    r = await call("/auth/refresh", "POST", undefined, {
      Cookie: `tt_refresh=${oldRefresh}; tt_csrf=${cookies.get("tt_csrf")}`,
    });
    assert.equal(r.status, 401);
    r = await call("/auth/me");
    assert.equal(r.status, 401, "replay revokes every session");
  },
);

import { PrismaClient } from "@prisma/client";
test(
  "Author/admin integration: story approval, free chapters and IDOR",
  { skip: !base || !process.env.DATABASE_URL },
  async () => {
    const db = new PrismaClient();
    const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3000";
    const cookies = new Map<string, string>();
    async function call(path: string, method = "GET", body?: unknown) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          "X-CSRF-Token": cookies.get("tt_csrf") || "",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const c of r.headers.getSetCookie()) {
        const [k, v] = c.split(";")[0].split("=");
        cookies.set(k, v);
      }
      return { status: r.status, data: await r.json() };
    }
    const email = `integration-author-${randomUUID()}@example.invalid`,
      password = `Test-${randomUUID()}`;
    try {
      let r = await call("/auth/register", "POST", {
        name: "Test author",
        email,
        password,
      });
      assert.equal(r.status, 201);
      r = await call("/auth/verify", "POST", { token: r.data.devVerifyToken });
      assert.equal(r.status, 201);
      r = await call("/auth/login", "POST", { email, password });
      assert.equal(r.status, 201);
      const user = await db.user.findUniqueOrThrow({ where: { email } });
      // Test-only fixture: never modifies an existing real user's permissions.
      await db.user.update({
        where: { id: user.id },
        data: { roles: ["READER", "AUTHOR", "ADMIN"] },
      });
      r = await call("/admin/users");
      assert.equal(r.status, 200);
      r = await call("/author/stories", "POST", {
        title: "Truyện kiểm thử tự động",
        description:
          "Câu chuyện dùng để kiểm thử quyền tác giả và quy trình duyệt truyện.",
        genre: "Tiên hiệp",
        cover: "jade",
      });
      assert.equal(r.status, 201, JSON.stringify(r));
      const storyId = r.data.id;
      r = await call(`/author/stories/${storyId}/chapters`, "POST", {
        title: "Chương chưa duyệt",
        content: "Nội dung kiểm thử ".repeat(50),
        isFree: true,
        price: 0,
      });
      assert.equal(r.status, 400);
      r = await call("/admin/review", "POST", {
        kind: "story",
        id: storyId,
        approve: true,
      });
      assert.equal(r.status, 201);
      r = await call(`/author/stories/${storyId}/chapters`, "POST", {
        title: "Không được khóa chương đầu",
        content: "Nội dung kiểm thử ".repeat(50),
        isFree: false,
        price: 20,
      });
      assert.equal(r.status, 400);
      r = await call(`/author/stories/${storyId}/chapters`, "POST", {
        title: "Chương đầu miễn phí",
        content: "Nội dung kiểm thử ".repeat(50),
        isFree: true,
        price: 0,
      });
      assert.equal(r.status, 201, JSON.stringify(r));
      const chapterId = r.data.id;
      r = await call(`/author/stories/${storyId}/prices`, "PUT", {
        from: 1,
        to: 1,
        isFree: false,
        price: 20,
      });
      assert.equal(r.status, 400);
      r = await call("/author/stories/story-1");
      assert.equal(
        r.status,
        404,
        "authors cannot access another author draft/editor",
      );
      const draft = await call(`/author/stories/${storyId}/drafts`, "POST");
      assert.equal(draft.status, 201);
      const draftBody = {
        title: "Chương nháp kiểm thử",
        content: "Nội dung nháp riêng tư ".repeat(50),
        isFree: true,
        price: 0,
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        expectedUpdatedAt: draft.data.updatedAt,
        expectedRevision: draft.data.revision,
      };
      const savedDraft = await call(
        `/author/drafts/${draft.data.id}`,
        "PUT",
        draftBody,
      );
      assert.equal(savedDraft.status, 200);
      assert.equal(savedDraft.data.status, "SCHEDULED");
      assert.equal(
        (await call(`/author/drafts/${draft.data.id}`, "PUT", draftBody))
          .status,
        409,
        "stale draft cannot overwrite newer content",
      );
      const draftPublicStory = await db.story.findUniqueOrThrow({
        where: { id: storyId },
      });
      assert.equal(
        (await call(`/stories/${draftPublicStory.slug}`)).data.chapters.length,
        1,
        "scheduled draft is absent from public chapters",
      );
      const follower = await db.user.create({
        data: {
          email: `integration-follower-${randomUUID()}@example.invalid`,
          name: "Follower test",
          passwordHash: user.passwordHash,
          emailVerified: true,
          wallet: { create: {} },
        },
      });
      await db.bookmark.create({
        data: { userId: follower.id, storyId, followed: true },
      });
      const published = await Promise.all([
        call(`/author/drafts/${draft.data.id}/publish`, "POST"),
        call(`/author/drafts/${draft.data.id}/publish`, "POST"),
      ]);
      for (const result of published)
        assert.equal(result.status, 201, JSON.stringify(result));
      assert.equal(published[0].data.id, published[1].data.id);
      assert.equal(
        await db.chapter.count({ where: { storyId } }),
        2,
        "concurrent draft publication creates one chapter",
      );
      assert.equal(
        await db.notification.count({ where: { userId: follower.id } }),
        1,
        "follower receives one notification",
      );
      assert.equal(
        (
          await call(`/author/drafts/${draft.data.id}`, "PUT", {
            ...draftBody,
            expectedUpdatedAt: savedDraft.data.updatedAt,
            expectedRevision: savedDraft.data.revision,
          })
        ).status,
        404,
      );
      assert.equal(
        (await call("/author/stories/story-1/drafts", "POST")).status,
        404,
      );
      r = await call("/author/payouts", "POST");
      assert.equal(r.status, 400, "zero earnings cannot be withdrawn");
      await assert.rejects(() =>
        db.wallet.update({ where: { userId: user.id }, data: { balance: -1 } }),
      );
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: user.id } }))
          .balance,
        0,
      );
      const purchase = await db.chapterPurchase.findFirst({
        where: {
          user: {
            email: { startsWith: "integration-" },
            name: "IntegrationTest",
          },
        },
        orderBy: { createdAt: "desc" },
      });
      assert(purchase);
      const before = await db.wallet.findUniqueOrThrow({
        where: { userId: purchase.userId },
      });
      r = await call(`/admin/refunds/${purchase.id}`, "POST");
      assert.equal(r.status, 201);
      r = await call(`/admin/refunds/${purchase.id}`, "POST");
      assert.equal(r.data.duplicate, true);
      assert.equal(
        (
          await db.wallet.findUniqueOrThrow({
            where: { userId: purchase.userId },
          })
        ).balance,
        before.balance + purchase.pricePaid,
      );
      const ledger = await db.walletTransaction.findFirstOrThrow({
        where: { userId: purchase.userId },
      });
      await assert.rejects(() =>
        db.walletTransaction.update({
          where: { id: ledger.id },
          data: { amount: 999999 },
        }),
      );
      // Hide only the synthetic fixture so it does not appear in the reading catalog.
      await db.story.update({
        where: { id: storyId },
        data: { status: "HIDDEN" },
      });
    } finally {
      await db.$disconnect();
    }
  },
);
