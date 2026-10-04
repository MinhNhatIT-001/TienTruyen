import { join } from "path";
import { HttpException } from "@nestjs/common";
import type { Request } from "express";
import { createHash } from "crypto";
import { z } from "zod";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function fail(message: string, status = 400): never {
  throw new HttpException({ message }, status);
}

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    fail(result.error.issues.map((i) => i.message).join("; "));
  return result.data as T;
}

export type AuthRequest = Request & {
  identity?: { id: string; roles: string[]; sid: string };
  rawBody?: Buffer;
};

export function auth(req: AuthRequest, role?: string) {
  if (!req.identity) fail("Vui lòng đăng nhập để tiếp tục.", 401);
  if (role && !req.identity!.roles.includes(role))
    fail("Bạn chưa có quyền thực hiện thao tác này.", 403);
  return req.identity!;
}

export function idempotency(req: Request) {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(key))
    fail("Thiếu mã giao dịch hợp lệ.");
  return key as string;
}
