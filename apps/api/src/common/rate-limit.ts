import Redis from "ioredis";
import { production } from "../config/environment";
export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    })
  : null;

redis?.on("error", () => {});

export const localLimits = new Map<string, { count: number; until: number }>();

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds = 60,
) {
  if (redis) {
    const n = (await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      key,
      windowSeconds,
    )) as number;
    return n <= limit;
  }
  if (production) return false;
  const now = Date.now();
  if (localLimits.size > 10000)
    for (const [k, v] of localLimits) if (v.until < now) localLimits.delete(k);
  let item = localLimits.get(key);
  if (!item || item.until < now) {
    item = { count: 0, until: now + windowSeconds * 1000 };
    localLimits.set(key, item);
  }
  return ++item.count <= limit;
}
