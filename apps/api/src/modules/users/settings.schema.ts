import { z } from "zod";
export const settingsSchema = z
  .object({
    fontSize: z.number().int().min(14).max(32),
    lineHeight: z.number().min(1.4).max(2.4),
    font: z.enum(["serif", "sans", "mono", "lexend"]),
    width: z.enum(["narrow", "medium", "wide", "full"]),
    theme: z.string().max(20),
    bg: z.string().regex(/^#[0-9a-f]{6}$/i),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  })
  .strict();
