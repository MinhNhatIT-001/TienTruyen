// Encrypted logical snapshot. Never upload the snapshot or its key to GitHub.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { encryptBackup, decryptBackup } from "./backup-crypto.mjs";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient, Prisma } = require("@prisma/client");
const command = process.argv[2] || "create";
const password = process.env.BACKUP_PASSPHRASE;
if (!password || password.length < 32)
  throw new Error(
    "Set BACKUP_PASSPHRASE (32+ characters) through a private env file.",
  );
const file = resolve(
  process.argv[3] ||
    `backups/tientruyen-${new Date().toISOString().replace(/[:.]/g, "-")}.ttbackup`,
);
const models = Prisma.dmmf.datamodel.models;
const delegate = (name) => name[0].toLowerCase() + name.slice(1);
function validate(snapshot) {
  if (
    snapshot.format !== "tientruyen-logical-v1" ||
    JSON.stringify(snapshot.schema) !==
      JSON.stringify(
        models.map((m) => ({
          name: m.name,
          fields: m.fields
            .filter((f) => f.kind !== "object")
            .map((f) => f.name),
        })),
      )
  )
    throw new Error(
      "Backup schema differs from this application; restore with the matching commit.",
    );
  for (const model of models)
    if (!Array.isArray(snapshot.tables?.[model.name]))
      throw new Error("Backup is incomplete.");
}
if (command === "verify") {
  const snapshot = decryptBackup(await readFile(file), password);
  validate(snapshot);
  console.log(
    `Verified encrypted backup: ${models.length} tables, ${Object.values(snapshot.tables).reduce((sum, rows) => sum + rows.length, 0)} rows.`,
  );
} else if (["create", "restore"].includes(command)) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const db = new PrismaClient();
  try {
    if (command === "create") {
      const tables = await db.$transaction(
        async (tx) => {
          const tables = {};
          for (const model of models)
            tables[model.name] = await tx[delegate(model.name)].findMany();
          return tables;
        },
        { isolationLevel: "RepeatableRead", timeout: 120000 },
      );
      const snapshot = {
        format: "tientruyen-logical-v1",
        createdAt: new Date().toISOString(),
        schema: models.map((m) => ({
          name: m.name,
          fields: m.fields
            .filter((f) => f.kind !== "object")
            .map((f) => f.name),
        })),
        tables,
      };
      const encrypted = encryptBackup(snapshot, password);
      validate(decryptBackup(encrypted, password));
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, encrypted, { mode: 0o600, flag: "wx" });
      console.log(
        `Encrypted snapshot saved: ${file}. Tables: ${models.length}.`,
      );
    } else {
      if (process.env.RESTORE_EMPTY_DATABASE !== "I_UNDERSTAND")
        throw new Error(
          "Restore is allowed only with RESTORE_EMPTY_DATABASE=I_UNDERSTAND and an empty target database.",
        );
      const snapshot = decryptBackup(await readFile(file), password);
      validate(snapshot);
      // Topological order respects all foreign keys, including nested comment replies.
      const ordered = [],
        remaining = [...models];
      while (remaining.length) {
        const index = remaining.findIndex((m) =>
          m.fields
            .filter(
              (f) =>
                f.kind === "object" &&
                f.relationFromFields?.length &&
                f.type !== m.name,
            )
            .every((f) => ordered.some((x) => x.name === f.type)),
        );
        if (index < 0)
          throw new Error("Model dependency cycle; manual restore required.");
        ordered.push(...remaining.splice(index, 1));
      }
      await db.$transaction(
        async (tx) => {
          for (const model of models)
            if (await tx[delegate(model.name)].count())
              throw new Error("Target is not empty. Nothing restored.");
          for (const model of ordered) {
            const rows = snapshot.tables[model.name].map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                  key,
                  value === null &&
                  model.fields.some((f) => f.name === key && f.type === "Json")
                    ? Prisma.DbNull
                    : value,
                ]),
              ),
            );
            if (rows.length)
              await tx[delegate(model.name)].createMany({ data: rows });
          }
          // Old logins and one-time tokens must not be revived after disaster recovery.
          await tx.session.updateMany({ data: { revokedAt: new Date() } });
          await tx.oneTimeToken.updateMany({ data: { usedAt: new Date() } });
          await tx.loginChallenge.updateMany({ data: { usedAt: new Date() } });
        },
        { isolationLevel: "Serializable", timeout: 120000 },
      );
      console.log(
        "Restore completed into an empty database; old sessions and challenges revoked.",
      );
    }
  } finally {
    await db.$disconnect();
  }
} else
  throw new Error(
    "Usage: node scripts/backup.mjs create|verify|restore [file]",
  );
