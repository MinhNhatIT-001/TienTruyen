import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const discrepancies = await db.$queryRaw<
    Array<{ userId: string; balance: number; ledger: bigint }>
  >`SELECT w."userId", w.balance, COALESCE(SUM(t.amount),0) AS ledger FROM "Wallet" w LEFT JOIN "WalletTransaction" t ON t."userId"=w."userId" GROUP BY w."userId",w.balance HAVING w.balance <> COALESCE(SUM(t.amount),0)`;
  console.log(
    JSON.stringify({ ok: discrepancies.length === 0, discrepancies }, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
  if (discrepancies.length) process.exitCode = 1;
  await db.topupOrder.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}
main()
  .catch(() => {
    console.error("Reconciliation failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
