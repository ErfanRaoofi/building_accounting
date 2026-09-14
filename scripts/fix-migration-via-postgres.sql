-- Run in postgres container (backend may be restarting):
--   psql -U postgres -d building_accounting -f /tmp/fix.sql
-- Or paste into: psql -U postgres -d building_accounting

DO $$ BEGIN
  CREATE TYPE "BuildingRole" AS ENUM ('MANAGER', 'ACCOUNTANT', 'BOARD', 'RESIDENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'role'
  ) THEN
    UPDATE "User" SET "isSuperAdmin" = true WHERE "role"::text = 'ADMIN';
  END IF;
END $$;

ALTER TABLE "BuildingAccess"
  ADD COLUMN IF NOT EXISTS "roles" "BuildingRole"[] NOT NULL DEFAULT ARRAY[]::"BuildingRole"[];

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'role'
  ) THEN
    UPDATE "BuildingAccess" AS ba
    SET "roles" = CASE
      WHEN u."role"::text = 'ACCOUNTANT' THEN ARRAY['ACCOUNTANT']::"BuildingRole"[]
      ELSE ARRAY['MANAGER']::"BuildingRole"[]
    END
    FROM "User" u
    WHERE u.id = ba."userId" AND cardinality(ba."roles") = 0;
  ELSE
    UPDATE "BuildingAccess"
    SET "roles" = ARRAY['MANAGER']::"BuildingRole"[]
    WHERE cardinality("roles") = 0;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'role'
  ) THEN
    ALTER TABLE "User" DROP COLUMN "role";
  END IF;
END $$;

DROP TYPE IF EXISTS "UserRole";

CREATE TABLE IF NOT EXISTS "UnitResident" (
  "userId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  CONSTRAINT "UnitResident_pkey" PRIMARY KEY ("userId","unitId")
);

CREATE TABLE IF NOT EXISTS "SignupRequest" (
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

CREATE INDEX IF NOT EXISTS "SignupRequest_status_buildingId_idx" ON "SignupRequest"("status", "buildingId");
CREATE INDEX IF NOT EXISTS "SignupRequest_email_buildingId_idx" ON "SignupRequest"("email", "buildingId");

-- Mark failed Prisma migration as applied so backend can start
UPDATE "_prisma_migrations"
SET
  finished_at = NOW(),
  logs = NULL,
  rolled_back_at = NULL,
  applied_steps_count = 1
WHERE migration_name = '20260914093000_user_roles_signup'
  AND finished_at IS NULL;
