import { test } from "node:test";
import assert from "node:assert/strict";
import { validJobAuthorization } from "../src/modules/jobs/job-auth";

test("scheduled jobs require a configured strong secret and exact Bearer token", () => {
  const secret = "a".repeat(40);
  assert.equal(validJobAuthorization(`Bearer ${secret}`, secret), true);
  for (const header of [
    undefined,
    secret,
    `bearer ${secret}`,
    `Bearer ${secret}extra`,
    `Bearer ${"b".repeat(40)}`,
  ])
    assert.equal(validJobAuthorization(header, secret), false);
  assert.equal(validJobAuthorization("Bearer short", "short"), false);
  assert.equal(validJobAuthorization("Bearer ", ""), false);
});
