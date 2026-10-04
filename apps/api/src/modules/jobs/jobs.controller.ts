import { validJobAuthorization } from "./job-auth";
import { providerOptions } from "../../integrations/providers";
import { Controller, Get, Param, Req } from "@nestjs/common";
import { redis } from "../../common/rate-limit";
import { fail, AuthRequest } from "../../common/http";
import {
  publishScheduledDrafts,
  reconcilePayments,
  ledgerCheck,
} from "./jobs.service";
import { paymentState } from "../wallet/payment.service";
@Controller("api")
export class JobsController {
  @Get("jobs/:job") async scheduledJob(
    @Param("job") job: string,
    @Req() req: AuthRequest,
  ) {
    if (!validJobAuthorization(req.headers.authorization))
      fail("Không có quyền truy cập.", 401);
    if (!["publish", "payments", "ledger"].includes(job))
      fail("Không tìm thấy tác vụ.", 404);
    if (!redis) fail("Scheduler cần Redis.", 503);
    if (job === "payments" && !providerOptions().paymentReady)
      fail("payOS chưa được cấu hình.", 503);
    if (!(await redis!.set(`tt:job:${job}`, "running", "EX", 300, "NX")))
      return { status: "skipped", job };
    if (job === "publish") await publishScheduledDrafts();
    if (job === "payments") await reconcilePayments({ paymentState });
    if (job === "ledger") {
      // Hobby's daily job publishes due drafts and reconciles missed callbacks.
      await publishScheduledDrafts();
      await reconcilePayments({ paymentState });
      await ledgerCheck();
    }
    return { status: "completed", job };
  }
}
