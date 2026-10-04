import { Controller, Get } from "@nestjs/common";
import { db } from "../../database/prisma";
import { economy } from "../wallet/economy.service";
@Controller("api")
export class HealthController {
  @Get("health") async health() {
    await db.$queryRaw`SELECT 1`;
    return { ok: true };
  }

  @Get("config") async config() {
    return economy();
  }
}
