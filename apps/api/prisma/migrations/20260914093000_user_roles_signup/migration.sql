-- CreateEnum
CREATE TYPE "BuildingRole" AS ENUM ('MANAGER', 'ACCOUNTANT', 'BOARD', 'RESIDENT');

-- CreateEnum
CREATE TYPE "SignupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "isSuperAdmin" = true WHERE "role" = 'ADMIN';

-- AlterTable
ALTER TABLE "BuildingAccess" ADD COLUMN "roles" "BuildingRole"[] NOT NULL DEFAULT ARRAY[]::"BuildingRole"[];

UPDATE "BuildingAccess" AS ba
SET "roles" = CASE
  WHEN u."role" = 'ACCOUNTANT' THEN ARRAY['ACCOUNTANT']::"BuildingRole"[]
  ELSE ARRAY['MANAGER']::"BuildingRole"[]
END
FROM "User" u
WHERE u.id = ba."userId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role";

DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "UnitResident" (
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "UnitResident_pkey" PRIMARY KEY ("userId","unitId")
);

-- CreateTable
CREATE TABLE "SignupRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "requestedRole" "BuildingRole" NOT NULL,
    "status" "SignupStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignupRequest_status_buildingId_idx" ON "SignupRequest"("status", "buildingId");

-- CreateIndex
CREATE INDEX "SignupRequest_email_buildingId_idx" ON "SignupRequest"("email", "buildingId");

-- AddForeignKey
ALTER TABLE "UnitResident" ADD CONSTRAINT "UnitResident_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitResident" ADD CONSTRAINT "UnitResident_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupRequest" ADD CONSTRAINT "SignupRequest_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupRequest" ADD CONSTRAINT "SignupRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
