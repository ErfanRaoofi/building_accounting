-- Fix failed migration 20260914093000_user_roles_signup (idempotent).
-- Run inside backend container:
--   npx prisma db execute --schema ./prisma/schema.prisma --file prisma/fix-failed-roles-migration.sql
-- Then:
--   npx prisma migrate resolve --applied 20260914093000_user_roles_signup --schema ./prisma/schema.prisma

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
    WHERE table_name = 'User' AND column_name = 'role'
  ) THEN
    UPDATE "User" SET "isSuperAdmin" = true WHERE "role"::text = 'ADMIN';
  END IF;
END $$;

ALTER TABLE "BuildingAccess"
  ADD COLUMN IF NOT EXISTS "roles" "BuildingRole"[] NOT NULL DEFAULT ARRAY[]::"BuildingRole"[];

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'role'
  ) THEN
    UPDATE "BuildingAccess" AS ba
    SET "roles" = CASE
      WHEN u."role"::text = 'ACCOUNTANT' THEN ARRAY['ACCOUNTANT']::"BuildingRole"[]
      ELSE ARRAY['MANAGER']::"BuildingRole"[]
    END
    FROM "User" u
    WHERE u.id = ba."userId"
      AND cardinality(ba."roles") = 0;
  ELSE
    UPDATE "BuildingAccess"
    SET "roles" = ARRAY['MANAGER']::"BuildingRole"[]
    WHERE cardinality("roles") = 0;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'role'
  ) THEN
    ALTER TABLE "User" DROP COLUMN "role";
  END IF;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "UserRole";
EXCEPTION WHEN dependent_objects_still_exist THEN NULL;
END $$;

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

DO $$ BEGIN
  ALTER TABLE "UnitResident"
    ADD CONSTRAINT "UnitResident_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UnitResident"
    ADD CONSTRAINT "UnitResident_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SignupRequest"
    ADD CONSTRAINT "SignupRequest_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SignupRequest"
    ADD CONSTRAINT "SignupRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
