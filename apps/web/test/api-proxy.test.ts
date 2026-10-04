import { test } from "node:test";
import assert from "node:assert/strict";
import { proxyApi } from "../src/lib/api-proxy";
test("runtime API proxy preserves body, CSRF, redirects and separate cookies", async (t) => {
  const previous = process.env.API_INTERNAL_URL;
  process.env.API_INTERNAL_URL = "http://test-api:4000";
  const calls: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const headers = new Headers({
      location: "https://accounts.google.com/authorize",
      "content-encoding": "gzip",
      "content-length": "100",
    });
    headers.append("set-cookie", "tt_access=one; Path=/; HttpOnly");
    headers.append("set-cookie", "tt_refresh=two; Path=/; HttpOnly");
    return new Response(null, { status: 302, headers });
  });
  try {
    const raw = '{"amount":20000}';
    const request = new Request(
      "http://localhost:3001/api/payments/payos/webhook?probe=yes",
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3001",
          "x-csrf-token": "test-csrf",
          cookie: "tt_csrf=test-csrf",
          "content-type": "application/json",
        },
        body: raw,
      },
    );
    const result = await proxyApi(request, ["payments", "payos", "webhook"]);
    assert.equal(
      calls[0].url,
      "http://test-api:4000/api/payments/payos/webhook?probe=yes",
    );
    assert.equal(
      Buffer.from(calls[0].init.body as ArrayBuffer).toString(),
      raw,
    );
    assert.equal(
      (calls[0].init.headers as Headers).get("origin"),
      "http://localhost:3001",
    );
    assert.equal(
      (calls[0].init.headers as Headers).get("x-csrf-token"),
      "test-csrf",
    );
    assert.equal(calls[0].init.redirect, "manual");
    assert.equal(result.status, 302);
    assert.equal(result.headers.getSetCookie().length, 2);
    assert.equal(result.headers.get("content-encoding"), null);
    process.env.API_INTERNAL_URL = "http://other-api:4000";
    await proxyApi(new Request("http://localhost/api/health"), ["health"]);
    assert.equal(calls[1].url, "http://other-api:4000/api/health");
    assert.equal(
      (await proxyApi(new Request("http://localhost/api/health"), [".."]))
        .status,
      400,
    );
  } finally {
    if (previous === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = previous;
  }
});
