-- Add recordingState column
ALTER TABLE "Device" ADD COLUMN "recordingState" TEXT;

-- Fix empty deviceId: populate from macAddress for records that have empty deviceId
UPDATE "Device" SET "deviceId" = "macAddress" WHERE "deviceId" = '' AND "macAddress" IS NOT NULL;

-- For any remaining records with empty deviceId and no macAddress, generate a unique id
UPDATE "Device" SET "deviceId" = 'Device_' || "id" WHERE "deviceId" = '';
