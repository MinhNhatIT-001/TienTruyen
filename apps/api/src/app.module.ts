import { Module } from "@nestjs/common";
import { ReadingController } from "./modules/reading/reading.controller";
import { StoriesController } from "./modules/stories/stories.controller";
import { AuthorController } from "./modules/author/author.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { JobsController } from "./modules/jobs/jobs.controller";
import { HealthController } from "./modules/health/health.controller";
import { UsersController } from "./modules/users/users.controller";
import { WalletController } from "./modules/wallet/wallet.controller";
import { AdminController } from "./modules/admin/admin.controller";
@Module({
  controllers: [
    ReadingController,
    StoriesController,
    AuthorController,
    AuthController,
    JobsController,
    HealthController,
    UsersController,
    WalletController,
    AdminController,
  ],
})
export class AppModule {}
