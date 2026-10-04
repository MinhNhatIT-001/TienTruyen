export const production = process.env.NODE_ENV === "production";

export const secret =
  process.env.JWT_SECRET ||
  (!production ? "development-only-change-this-secret-32chars" : "");

export const origin = process.env.APP_ORIGIN || "http://localhost:3000";

export const allowedOrigins = production
  ? [origin]
  : [...new Set([origin, "http://localhost:3000", "http://127.0.0.1:3000"])];

if (secret.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters");

if (
  production &&
  (!process.env.REDIS_URL ||
    !process.env.APP_ORIGIN?.startsWith("https://") ||
    secret.includes("replace-") ||
    secret.includes("development-"))
)
  throw new Error("Production requires Redis, HTTPS and a random JWT secret");
