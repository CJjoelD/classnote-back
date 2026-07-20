-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- AlterTable: Add Google auth fields to User
ALTER TABLE "User" ADD COLUMN "provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN "avatar" TEXT;

-- CreateIndex for googleId
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
