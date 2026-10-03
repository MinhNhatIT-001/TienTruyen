import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Use a reviewed operator procedure in production");
  const email = process.argv[2];
  if (!email) throw new Error("Usage: bootstrap-admin <verified local email>");
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user?.emailVerified)
    throw new Error("Register and verify the local account first");
  await db.user.update({
    where: { id: user.id },
    data: { roles: [...new Set([...user.roles, "ADMIN"])] },
  });
  await db.auditLog.create({
    data: { actorId: user.id, action: "LOCAL_ADMIN_BOOTSTRAP" },
  });
  console.log(
    "Local admin role enabled.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
