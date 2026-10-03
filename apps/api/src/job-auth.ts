import { timingSafeEqual } from "node:crypto";

export function validJobAuthorization(
  header: string | undefined,
  secret = process.env.CRON_SECRET,
): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
