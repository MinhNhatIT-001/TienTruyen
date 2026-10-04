// Verify the built Nest application without opening a server or connecting to a database.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { readFileSync } = require("node:fs");
const assert = require("node:assert/strict");
const root = resolve(__dirname, "../..");
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
apiRequire("reflect-metadata");
const { NestFactory } = apiRequire("@nestjs/core");
const { PATH_METADATA, METHOD_METADATA } = apiRequire(
  "@nestjs/common/constants",
);
const { AppModule } = require(resolve(root, "apps/api/dist/app.module.js"));
async function check() {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.init();
    const controllers = Reflect.getMetadata("controllers", AppModule);
    const verbs = { 0: "Get", 1: "Post", 2: "Put", 3: "Delete" };
    const routes = [];
    for (const Controller of controllers) {
      for (const name of Object.getOwnPropertyNames(Controller.prototype)) {
        const method = Controller.prototype[name];
        if (typeof method !== "function") continue;
        const path = Reflect.getMetadata(PATH_METADATA, method);
        const verb = Reflect.getMetadata(METHOD_METADATA, method);
        if (path !== undefined && verb !== undefined)
          routes.push(`${verbs[verb]} /api/${path}`);
      }
    }
    const expected = JSON.parse(
      readFileSync(resolve(root, "apps/api/test/fixtures/routes.json")),
    );
    assert.deepEqual(routes.sort(), expected, "Public route contract changed.");
    const admin = app.get(
      controllers.find((c) => c.name === "AdminController"),
    );
    const author = app.get(
      controllers.find((c) => c.name === "AuthorController"),
    );
    const wallet = app.get(
      controllers.find((c) => c.name === "WalletController"),
    );
    await assert.rejects(
      () => admin.adminList({}, "summary"),
      (e) => e.getStatus() === 401,
    );
    await assert.rejects(
      () =>
        admin.adminList(
          { identity: { id: "qa", roles: ["READER"], sid: "qa" } },
          "summary",
        ),
      (e) => e.getStatus() === 403,
    );
    await assert.rejects(
      () => author.myStories({}),
      (e) => e.getStatus() === 401,
    );
    await assert.rejects(
      () => wallet.myOrders({}),
      (e) => e.getStatus() === 401,
    );
    console.log(
      `PASS Nest startup, ${routes.length} route contracts and authentication/role guards.`,
    );
  } finally {
    await app.close();
  }
}
check().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
