import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const env = { ...process.env };
if (existsSync(resolve(root, ".env"))) {
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split(
    /\r?\n/,
  )) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !env[match[1]])
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
const action = process.argv[2] || "dev";
const node = process.execPath;
const prisma = resolve(root, "apps/api/node_modules/prisma/build/index.js");
const tsx = resolve(root, "apps/api/node_modules/tsx/dist/loader.mjs");
const next = resolve(root, "apps/web/node_modules/next/dist/bin/next");
const schema = resolve(root, "apps/api/prisma/schema.prisma");
const children = [];
function run(args, cwd = root) {
  const child = spawn(node, args, { cwd, env, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (code) {
      process.exitCode = code;
      for (const c of children) if (c !== child) c.kill();
    }
  });
  return child;
}
switch (action) {
  case "migrate":
    run([prisma, "migrate", "deploy", "--schema", schema]);
    break;
  case "seed":
    run(["--import", tsx, "apps/api/prisma/seed.ts"]);
    break;
  case "reconcile":
    run(["apps/api/dist/reconcile.js"]);
    break;
  case "admin":
    run(["apps/api/dist/bootstrap-admin.js", process.argv[3] || ""]);
    break;
  case "test:integration":
    env.INTEGRATION_URL ||= "http://127.0.0.1:4000/api";
    env.TEST_ORIGIN ||= env.APP_ORIGIN || "http://localhost:3000";
    run([
      "--import",
      tsx,
      "--test",
      "apps/api/test/integration.test.ts",
      "apps/api/test/policy.test.ts",
    ]);
    break;
  case "web":
    run([next, "dev", "--hostname", "127.0.0.1", "--port", "3000"], resolve(root, "apps/web"));
    break;
  case "dev":
    env.TSX_TSCONFIG_PATH = resolve(root, "apps/api/tsconfig.json");
    run(["--import", tsx, "--watch", "apps/api/src/main.ts"]);
    run([next, "dev", "--hostname", "127.0.0.1", "--port", "3000"], resolve(root, "apps/web"));
    break;
  default:
    throw new Error("Unknown action: " + action);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
