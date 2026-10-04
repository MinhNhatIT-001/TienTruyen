// Report missing configuration names only; never print credentials.
const required = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "APP_ORIGIN",
  "CRON_SECRET",
];
const missing = required.filter((key) => !process.env[key]);
if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN)
  missing.push("BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN");
const invalid = [];
for (const key of ["JWT_SECRET", "CRON_SECRET"])
  if (process.env[key] && process.env[key].length < 32) invalid.push(key);
if (process.env.APP_ORIGIN && !process.env.APP_ORIGIN.startsWith("https://"))
  invalid.push("APP_ORIGIN");
for (const key of ["DATABASE_URL", "REDIS_URL"])
  if (
    process.env[key] &&
    /localhost|127\.0\.0\.1|@(?:db|redis):/.test(process.env[key])
  )
    invalid.push(key);
if (missing.length) console.error("Missing:", missing.join(", "));
if (invalid.length) console.error("Invalid for cloud:", invalid.join(", "));
process.exitCode = missing.length || invalid.length ? 1 : 0;
if (!process.exitCode)
  console.log(
    "Cloud configuration present. Live connections and provider credentials still require verification.",
  );
