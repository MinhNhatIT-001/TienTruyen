import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptBackup, decryptBackup } from "./backup-crypto.mjs";
const password = "test-backup-key-32-characters-or-longer";
test("encrypted backup preserves unicode, dates, wallet records and cannot be read as plain JSON", () => {
  const data = {
    name: "Tiên Truyện",
    balance: 525,
    createdAt: "2026-10-03T00:00:00.000Z",
    tables: { User: [] },
  };
  const file = encryptBackup(data, password);
  assert.deepEqual(decryptBackup(file, password), data);
  assert(!file.includes(Buffer.from("Tiên Truyện")));
});
test("wrong password and a modified backup are rejected", () => {
  const file = encryptBackup({ balance: 525 }, password);
  assert.throws(() =>
    decryptBackup(file, "another-password-32-characters-or-longer"),
  );
  file[file.length - 1] ^= 1;
  assert.throws(() => decryptBackup(file, password));
  assert.throws(() => encryptBackup({}, "short"));
});
