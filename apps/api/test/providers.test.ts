import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  normalizePhone,
  payosSignature,
  oauthUrl,
  oauthIdentity,
  payos,
} from "../src/providers";
test("Vietnamese mobile numbers normalize to one identity", () => {
  assert.equal(normalizePhone("0912 345 678"), "+84912345678");
  assert.equal(normalizePhone("+84 912 345 678"), "+84912345678");
  for (const invalid of [
    "123456",
    "+12025550123",
    "02412345678",
    "091234567890",
  ])
    assert.throws(() => normalizePhone(invalid));
});
test("payOS signing uses sorted fields and detects altered amount", () => {
  const data = {
    orderCode: 123,
    amount: 20000,
    description: "TT123",
    returnUrl: "https://example.com/return",
    cancelUrl: "https://example.com/cancel",
  };
  const canonical =
    "amount=20000&cancelUrl=https://example.com/cancel&description=TT123&orderCode=123&returnUrl=https://example.com/return";
  assert.equal(
    payosSignature(data, "test-key"),
    createHmac("sha256", "test-key").update(canonical).digest("hex"),
  );
  assert.notEqual(
    payosSignature(data, "test-key"),
    payosSignature({ ...data, amount: 50000 }, "test-key"),
  );
});

test("OAuth authorization uses exact callback, state and Google PKCE account chooser", () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, {
      APP_ORIGIN: "https://reader.example",
      GOOGLE_CLIENT_ID: "google-app",
      GOOGLE_CLIENT_SECRET: "google-secret",
      FACEBOOK_CLIENT_ID: "fb-app",
      FACEBOOK_CLIENT_SECRET: "fb-secret",
      FACEBOOK_GRAPH_VERSION: "v23.0",
    });
    const google = new URL(oauthUrl("google", "random-state", "pkce-hash"));
    assert.equal(google.origin, "https://accounts.google.com");
    assert.equal(google.searchParams.get("state"), "random-state");
    assert.equal(google.searchParams.get("prompt"), "select_account");
    assert.equal(google.searchParams.get("code_challenge_method"), "S256");
    assert.equal(
      google.searchParams.get("redirect_uri"),
      "https://reader.example/api/auth/oauth/google/callback",
    );
    assert.equal(google.searchParams.has("client_secret"), false);
    const facebook = new URL(oauthUrl("facebook", "fb-state", "ignored"));
    assert.equal(facebook.origin, "https://www.facebook.com");
    assert.equal(facebook.searchParams.get("scope"), "public_profile");
    assert.equal(facebook.searchParams.has("client_secret"), false);
  } finally {
    process.env = previous;
  }
});

test("Google code exchange requires a verified identity", async () => {
  const previous = { ...process.env },
    original = globalThis.fetch;
  try {
    Object.assign(process.env, {
      GOOGLE_CLIENT_ID: "test-app",
      GOOGLE_CLIENT_SECRET: "test-secret",
    });
    globalThis.fetch = (async (url, init) => {
      if (String(url).includes("oauth2.googleapis.com")) {
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get("code_verifier"), "verifier");
        return Response.json({ access_token: "access" });
      }
      return Response.json({
        sub: "identity",
        email: "reader@example.invalid",
        email_verified: false,
      });
    }) as typeof fetch;
    await assert.rejects(() => oauthIdentity("google", "code", "verifier"));
  } finally {
    globalThis.fetch = original;
    process.env = previous;
  }
});

test("Facebook rejects a token issued for another app", async () => {
  const previous = { ...process.env },
    original = globalThis.fetch;
  try {
    Object.assign(process.env, {
      FACEBOOK_CLIENT_ID: "our-app",
      FACEBOOK_CLIENT_SECRET: "secret",
      FACEBOOK_GRAPH_VERSION: "v23.0",
    });
    globalThis.fetch = (async (url) =>
      Response.json(
        String(url).includes("debug_token")
          ? {
              data: { is_valid: true, app_id: "other-app", user_id: "someone" },
            }
          : { access_token: "access" },
      )) as typeof fetch;
    await assert.rejects(() => oauthIdentity("facebook", "code", ""));
  } finally {
    globalThis.fetch = original;
    process.env = previous;
  }
});

test("payOS accepts only signed responses and rejects altered payment data", async () => {
  const previous = { ...process.env },
    original = globalThis.fetch;
  try {
    Object.assign(process.env, {
      PAYMENT_PROVIDER: "payos",
      PAYOS_CLIENT_ID: "test-client",
      PAYOS_API_KEY: "test-api",
      PAYOS_CHECKSUM_KEY: "test-key",
    });
    const data = {
      id: "payment",
      orderCode: 123,
      amount: 20000,
      status: "PAID",
      amountPaid: 20000,
      amountRemaining: 0,
    };
    const signature = payosSignature(data, "test-key");
    globalThis.fetch = (async () =>
      Response.json({ code: "00", data, signature })) as typeof fetch;
    assert.deepEqual(await payos("/v2/payment-requests/123"), data);
    globalThis.fetch = (async () =>
      Response.json({
        code: "00",
        data: { ...data, amount: 50000 },
        signature,
      })) as typeof fetch;
    await assert.rejects(() => payos("/v2/payment-requests/123"));
    globalThis.fetch = (async () =>
      Response.json({ code: "00", data })) as typeof fetch;
    await assert.rejects(() => payos("/v2/payment-requests/123"));
  } finally {
    globalThis.fetch = original;
    process.env = previous;
  }
});
