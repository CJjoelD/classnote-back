-- AlterTable: Add new columns
ALTER TABLE "Device" ADD COLUMN "deviceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Device" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Device" ADD COLUMN "firmwareVersion" TEXT;
ALTER TABLE "Device" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;

-- Populate deviceId for existing records using their macAddress
UPDATE "Device" SET "deviceId" = "macAddress" WHERE "macAddress" IS NOT NULL AND "deviceId" = '';

-- Drop the unique constraint on macAddress (if exists)
ALTER TABLE "Device" DROP CONSTRAINT IF EXISTS "Device_macAddress_key";

-- Make macAddress nullable
ALTER TABLE "Device" ALTER COLUMN "macAddress" DROP NOT NULL;

-- Add unique constraint on deviceId
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");
