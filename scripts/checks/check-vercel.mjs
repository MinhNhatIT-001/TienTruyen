// Read-only live checks: never create orders or mutate a real user's data.
import assert from "node:assert/strict";
const origin = (
  process.env.VERCEL_TEST_ORIGIN || "https://tientruyen.vercel.app"
).replace(/\/$/, "");
assert(
  new URL(origin).protocol === "https:",
  "Use the HTTPS Vercel deployment.",
);
let failures = 0;
async function check(path, inspect) {
  try {
    const response = await fetch(origin + path, {
      signal: AbortSignal.timeout(25000),
      redirect: "manual",
    });
    await inspect(response);
    console.log(`PASS ${path}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${path}: ${e.message}`);
  }
}
await check("/api/health", async (r) => {
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});
let stories = [];
await check("/api/stories", async (r) => {
  assert.equal(r.status, 200);
  stories = await r.json();
  assert(Array.isArray(stories));
  assert(stories.length > 0);
  assert(!JSON.stringify(stories).includes("passwordHash"));
});
await Promise.all(
  [
    "/",
    "/ho-tro",
    "/gioi-thieu",
    "/dieu-khoan",
    "/chinh-sach-bao-mat",
    "/the-loai/tat-ca",
    "/dang-nhap",
    "/sitemap.xml",
  ].map((path) =>
    check(path, async (r) => {
      assert.equal(r.status, 200);
      assert((await r.text()).length > 100);
    }),
  ),
);
await check("/api/admin/summary", async (r) =>
  assert([401, 403].includes(r.status), "Admin metrics must reject guests."),
);
await check("/api/wallet/orders", async (r) =>
  assert([401, 403].includes(r.status), "Orders must reject guests."),
);
const sample =
  stories.find((story) => story.slug === "van-dao-truong-sinh") || stories[0];
if (sample) {
  await check(`/api/stories/${encodeURIComponent(sample.slug)}`, async (r) => {
    assert.equal(r.status, 200);
    const story = await r.json();
    assert(
      !story.chapters.some((chapter) => "content" in chapter),
      "Chapter list must not contain paid content.",
    );
    const paid = story.chapters.find((chapter) => !chapter.isFree);
    if (paid)
      await check(
        `/api/stories/${encodeURIComponent(story.slug)}/chapters/${paid.number}`,
        async (response) => {
          assert.equal(response.status, 200);
          assert.equal(
            (await response.json()).content,
            undefined,
            "Paid chapter content leaked to guest.",
          );
        },
      );
  });
}
if (failures) process.exitCode = 1;
else
  console.log(
    "Vercel smoke checks passed; interactive browser checks are still required.",
  );
