import { Prisma } from "@prisma/client";
import { db } from "../database/prisma";
export async function audit(
  actorId: string | null,
  action: string,
  targetId?: string,
  tx: Prisma.TransactionClient = db,
) {
  await tx.auditLog.create({ data: { actorId, action, targetId } });
}
