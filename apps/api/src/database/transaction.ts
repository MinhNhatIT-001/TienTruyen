import { Prisma } from "@prisma/client";
import { db } from "./prisma";
export async function serial<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 6; i++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        // A small serverless pool can queue concurrent purchases after a cold start.
        maxWait: 10000,
        timeout: 10000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" ||
          e.code === "P2002" ||
          (e.code === "P2010" && e.meta?.code === "40001")) &&
        i < 5
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 10 + Math.random() * 30),
        );
        continue;
      }
      throw e;
    }
  }
  throw new Error("Transaction failed");
}
