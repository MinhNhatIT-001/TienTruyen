import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "../../database/prisma";
import { production, secret } from "../../config/environment";
import { hash } from "../../common/http";
export function cookies(
  res: Response,
  access: string,
  refresh: string,
  csrf: string,
) {
  const common = {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
  };
  res.cookie("tt_access", access, { ...common, maxAge: 15 * 60 * 1000 });
  res.cookie("tt_refresh", refresh, { ...common, maxAge: 30 * 86400000 });
  res.cookie("tt_csrf", csrf, {
    ...common,
    httpOnly: false,
    maxAge: 30 * 86400000,
  });
}

export async function session(userId: string, req: Request, res: Response) {
  const token = randomBytes(40).toString("hex");
  const s = await db.session.create({
    data: {
      userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      device: (req.headers["user-agent"] || "Unknown").slice(0, 250),
    },
  });
  cookies(
    res,
    jwt.sign({ sub: userId, sid: s.id }, secret, {
      expiresIn: "15m",
      issuer: "tientruyen",
      audience: "web",
    }),
    token,
    randomBytes(24).toString("hex"),
  );
}

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .transform((value) => value.normalize("NFC"))
      .pipe(
        z
          .string()
          .min(8, "Tên hiển thị cần ít nhất 8 ký tự.")
          .max(15, "Tên hiển thị tối đa 15 ký tự."),
      ),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z
      .string()
      .min(10)
      .max(128)
      .refine(
        (v) =>
          !["password123", "1234567890", "qwerty12345", "12345678910"].includes(
            v.toLowerCase(),
          ),
        "Mật khẩu quá phổ biến.",
      ),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.email().transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
