import { PrismaClient } from "@prisma/client";
import catalog from "./reference-catalog.json";
const db = new PrismaClient();
async function main() {
  if (new Set(catalog.map((s) => s.slug)).size !== catalog.length)
    throw new Error("Duplicate catalog slug");
  const author = await db.user.findUnique({ where: { email: "author@example.invalid" } });
  if (!author) throw new Error("Editorial account missing; no data changed.");
  const conflicts = await db.story.findMany({
    where: { slug: { in: catalog.map((s) => s.slug) } },
    select: { slug: true, authorId: true },
  });
  if (conflicts.some((s) => s.authorId !== author.id))
    throw new Error("An existing story belongs to another account; no data changed.");
  if (!process.argv.includes("--apply")) {
    console.log(`Ready: ${catalog.length} reference entries, ${conflicts.length} already present. No changes applied.`);
    return;
  }
  // Metadata only: never creates chapters, modifies wallets or overwrites existing stories.
  await db.$transaction(catalog.map((story) => db.story.upsert({
    where: { slug: story.slug }, update: {},
    create: { ...story, authorId: author.id, status: "APPROVED" },
  })));
  const entries = await db.story.findMany({
    where: { slug: { in: catalog.map((s) => s.slug) } },
    select: { title: true, _count: { select: { chapters: true } } },
  });
  console.log(`Verified ${entries.length} reference entries; ${entries.reduce((n, s) => n + s._count.chapters, 0)} chapters.`);
}
main().finally(() => db.$disconnect());
