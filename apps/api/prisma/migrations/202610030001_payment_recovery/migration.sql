ALTER TABLE "TopupOrder" ADD COLUMN "qrCode" TEXT, ADD COLUMN "reviewReason" TEXT, ADD COLUMN "receivedVnd" INTEGER;
ALTER TABLE "OneTimeToken" ADD COLUMN "targetEmail" TEXT;
ALTER TABLE "TopupOrder" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
