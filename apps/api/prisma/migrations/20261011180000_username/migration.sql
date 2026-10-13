ALTER TABLE "User" RENAME COLUMN "email" TO "username";
ALTER INDEX "User_email_key" RENAME TO "User_username_key";

ALTER TABLE "SignupRequest" RENAME COLUMN "email" TO "username";
ALTER INDEX "SignupRequest_email_buildingId_idx" RENAME TO "SignupRequest_username_buildingId_idx";
