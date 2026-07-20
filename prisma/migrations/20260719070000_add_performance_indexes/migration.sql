-- Performance indexes for User
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_provider_idx" ON "User"("provider");

-- Performance indexes for Class
CREATE INDEX IF NOT EXISTS "Class_status_idx" ON "Class"("status");
CREATE INDEX IF NOT EXISTS "Class_createdAt_idx" ON "Class"("createdAt");

-- Performance indexes for Device
CREATE INDEX IF NOT EXISTS "Device_isOnline_idx" ON "Device"("isOnline");
CREATE INDEX IF NOT EXISTS "Device_recordingState_idx" ON "Device"("recordingState");
CREATE INDEX IF NOT EXISTS "Device_lastSeenAt_idx" ON "Device"("lastSeenAt");
