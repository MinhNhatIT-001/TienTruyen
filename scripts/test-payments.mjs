import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  openSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("..", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "tientruyen-payment-"));
const name = `tientruyen-payment-${Date.now()}`;
let api,
  created = false;
const run = (command, args, env = process.env, capture = false) => {
  const r = spawnSync(command, args, {
    cwd,
    env,
    stdio: capture ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Error(`${command} failed${capture ? `: ${r.stderr}` : ""}`);
  return r.stdout?.trim();
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  run(
    "docker",
    [
      "run",
      "-d",
      "--name",
      name,
      "-e",
      "POSTGRES_USER=tientruyen",
      "-e",
      "POSTGRES_DB=tientruyen_payment_test",
      "-e",
      "POSTGRES_PASSWORD=local-payment-test-only",
      "-p",
      "127.0.0.1::5432",
      "postgres:16.11-alpine",
    ],
    process.env,
    true,
  );
  created = true;
  const port = run("docker", ["port", name, "5432/tcp"], process.env, true)
    .split(":")
    .pop();
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://tientruyen:local-payment-test-only@127.0.0.1:${port}/tientruyen_payment_test`,
    NODE_ENV: "test",
    VERCEL: "1",
    APP_ORIGIN: "http://localhost:3000",
    PORT: "4106",
    JWT_SECRET: "payment-test-only-secret-32-characters",
    PAYMENT_PROVIDER: "payos",
    PAYOS_CLIENT_ID: "test-client",
    PAYOS_API_KEY: "test-api",
    PAYOS_CHECKSUM_KEY: "test-checksum",
    PAYOS_TEST_STATE: join(temp, "state.json"),
    PAYOS_INTEGRATION_URL: "http://127.0.0.1:4106/api",
  };
  delete env.REDIS_URL;
  delete env.SMTP_URL;
  for (let i = 0; i < 30; i++) {
    const r = spawnSync(
      "docker",
      ["exec", name, "pg_isready", "-U", "tientruyen"],
      { stdio: "ignore" },
    );
    if (r.status === 0) break;
    if (i === 29) throw new Error("Test database did not become ready");
    await sleep(1000);
  }
  run("pnpm", ["--filter", "@tientruyen/api", "db:generate"], env);
  run("pnpm", ["--filter", "@tientruyen/api", "db:migrate"], env);
  run("pnpm", ["--filter", "@tientruyen/api", "build"], env);
  // Refuse to contact an unrelated process already listening on the test port.
  const { createServer } = await import("node:net");
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(4106, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
  writeFileSync(env.PAYOS_TEST_STATE, "{}");
  const log = openSync(join(temp, "api.log"), "w");
  api = spawn(
    process.execPath,
    [
      "--require",
      "./apps/api/test/fixtures/payos-preload.cjs",
      "apps/api/dist/main.js",
    ],
    { cwd, env, stdio: ["ignore", log, log] },
  );
  closeSync(log);
  for (let i = 0; i < 30; i++) {
    if (api.exitCode !== null)
      throw new Error("Test API exited before becoming ready");
    try {
      if ((await fetch(`${env.PAYOS_INTEGRATION_URL}/health`)).ok) break;
    } catch {}
    if (i === 29) throw new Error("Test API did not become ready");
    await sleep(1000);
  }
  run(
    "pnpm",
    [
      "--filter",
      "@tientruyen/api",
      "exec",
      "tsx",
      "--test",
      "test/payos-integration.test.ts",
    ],
    env,
  );
} finally {
  if (api && api.exitCode === null) {
    api.kill("SIGTERM");
    await new Promise((resolve) => api.once("exit", resolve));
  }
  if (created) run("docker", ["rm", "-f", name], process.env, true);
  rmSync(temp, { recursive: true, force: true });
}
