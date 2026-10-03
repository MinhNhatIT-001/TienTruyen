// Exercise restore in a disposable schema; never point a deployed service at it.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { decryptBackup } from "./backup-crypto.mjs";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient, Prisma } = require("@prisma/client");
const snapshotFile = process.argv[2];
assert(
  snapshotFile && process.env.DATABASE_URL && process.env.BACKUP_PASSPHRASE,
  "Backup file and private environment are required.",
);
const snapshot = decryptBackup(
  await readFile(snapshotFile),
  process.env.BACKUP_PASSPHRASE,
);
const schema = `tt_restore_test_${randomBytes(8).toString("hex")}`;
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("schema", schema);
const source = new PrismaClient();
const target = new PrismaClient({ datasources: { db: { url: url.href } } });
const childEnv = {
  ...process.env,
  DATABASE_URL: url.href,
  RESTORE_EMPTY_DATABASE: "I_UNDERSTAND",
};
try {
  await source.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const migrated = spawnSync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      "apps/api/prisma/schema.prisma",
    ],
    { env: childEnv, encoding: "utf8", timeout: 120000 },
  );
  assert.equal(
    migrated.status,
    0,
    "Could not migrate the disposable restore schema.",
  );
  const restored = spawnSync(
    process.execPath,
    ["scripts/backup.mjs", "restore", snapshotFile],
    { env: childEnv, encoding: "utf8", timeout: 150000 },
  );
  assert.equal(
    restored.status,
    0,
    "Restore into the isolated schema failed. No production table was targeted.",
  );
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = model.name[0].toLowerCase() + model.name.slice(1);
    assert.equal(
      await target[delegate].count(),
      snapshot.tables[model.name].length,
      `${model.name} count differs`,
    );
  }
  assert.equal(
    await target.session.count({ where: { revokedAt: null } }),
    0,
    "Restore must revoke old sessions.",
  );
  const before = snapshot.tables.Wallet.reduce(
    (sum, row) => sum + row.balance,
    0,
  );
  assert.equal(
    (await target.wallet.aggregate({ _sum: { balance: true } }))._sum.balance ||
      0,
    before,
  );
  console.log(
    `Restore verified in an isolated schema: ${Prisma.dmmf.datamodel.models.length} tables and wallet totals match.`,
  );
} finally {
  await target.$disconnect();
  await source.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await source.$disconnect();
  console.log(
    "Disposable restore schema removed; production tables unchanged.",
  );
}
