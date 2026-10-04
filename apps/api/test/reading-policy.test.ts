import { test } from "node:test";
import assert from "node:assert/strict";
import { batchQuote, publicationDate } from "../src/modules/reading/reading-policy";
const chapter = (id: string, price = 20) => ({
  id,
  storyId: "story",
  isFree: false,
  price,
  story: { authorId: "author" },
  purchases: [] as unknown[],
});
test("batch quote excludes free and owned chapters and keeps exact total", () => {
  const paid = chapter("paid"),
    free = { ...chapter("free"), isFree: true },
    owned = { ...chapter("owned"), purchases: [{}] };
  const quote = batchQuote(
    [paid, free, owned],
    ["paid", "free", "owned", "paid"],
    "reader",
    20,
  );
  assert.deepEqual(
    quote.wanted.map((c) => c.id),
    ["paid"],
  );
  assert.equal(quote.total, 20);
});
test("stale price, removed chapter, mixed stories and self purchase cannot be charged", () => {
  assert.throws(() => batchQuote([chapter("one", 30)], ["one"], "reader", 20));
  assert.throws(() =>
    batchQuote([chapter("one")], ["one", "missing"], "reader", 20),
  );
  assert.throws(() =>
    batchQuote(
      [chapter("one"), { ...chapter("two"), storyId: "other" }],
      ["one", "two"],
      "reader",
      40,
    ),
  );
  assert.throws(() => batchQuote([chapter("one")], ["one"], "author", 20));
});
test("owned chapters have no additional charge", () => {
  assert.equal(
    batchQuote([{ ...chapter("one"), purchases: [{}] }], ["one"], "reader", 0)
      .total,
    0,
  );
  assert.throws(() =>
    batchQuote([{ ...chapter("one"), purchases: [{}] }], ["one"], "reader", 20),
  );
});
test("publication schedule handles timezone and exact lower bound", () => {
  const now = Date.parse("2026-10-02T00:00:00Z");
  assert.equal(publicationDate(null, now), null);
  assert.equal(
    publicationDate("2026-10-02T07:01:00+07:00", now)?.toISOString(),
    "2026-10-02T00:01:00.000Z",
  );
  assert.throws(() => publicationDate("2026-10-02T00:00:59Z", now));
  assert.throws(() => publicationDate("bad", now));
  assert.throws(() => publicationDate("2028-10-02T00:00:00Z", now));
});
