// Stable serverless entrypoint; the build generates the application in dist.
require("@nestjs/core");
require("./dist/main.js");
