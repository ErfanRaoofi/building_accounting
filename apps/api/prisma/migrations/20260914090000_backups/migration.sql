-- CreateEnum
CREATE TYPE "BackupFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "BackupKind" AS ENUM ('MANUAL', 'SCHEDULED', 'UPLOAD');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('READY', 'FAILED');

-- CreateTable
CREATE TABLE "BackupSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "BackupFrequency" NOT NULL DEFAULT 'DAILY',
    "hour" INTEGER NOT NULL DEFAULT 2,
    "keepLast" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "kind" "BackupKind" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default settings
INSERT INTO "BackupSettings" ("id", "enabled", "frequency", "hour", "keepLast", "updatedAt")
VALUES ('default', false, 'DAILY', 2, 14, CURRENT_TIMESTAMP);
