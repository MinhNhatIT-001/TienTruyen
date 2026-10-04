import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSearch } from "../src/lib/search";
test("Vietnamese search matches typed text without accents, including đ and decomposed unicode", () => {
  assert(
    normalizeSearch("Vấn Đạo Trường Sinh · Mặc Vũ").includes(
      normalizeSearch("van dao"),
    ),
  );
  assert.equal(normalizeSearch("Độc giả"), normalizeSearch("Doc gia"));
  assert.equal(
    normalizeSearch("Tiên Truyện"),
    normalizeSearch("Tiên Truyện".normalize("NFD")),
  );
  assert(
    !normalizeSearch("Sơn Hà Cố Nhân").includes(normalizeSearch("mua ha")),
  );
});
