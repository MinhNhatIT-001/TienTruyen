import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrl } from "../../web/src/lib/api-url";

test("binding wins over Docker URL, preserves base path and resolves at runtime", (t) => {
  const previous = {
    API_INTERNAL_URL: process.env.API_INTERNAL_URL,
    API_SERVICE_URL: process.env.API_SERVICE_URL,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.API_INTERNAL_URL = "http://api:4000";
  process.env.API_SERVICE_URL = "https://internal.example/service/";
  assert.equal(
    String(apiUrl("/stories?q=test")),
    "https://internal.example/service/api/stories?q=test",
  );
  process.env.API_SERVICE_URL = "https://preview.example";
  assert.equal(
    String(apiUrl("auth/oauth/google/callback")),
    "https://preview.example/api/auth/oauth/google/callback",
  );
});
