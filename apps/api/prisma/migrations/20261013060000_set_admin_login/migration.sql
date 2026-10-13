-- On deploy, move the original superadmin login to the current username
-- and set its password. Safe to run when that user is already renamed.

UPDATE "User"
SET "username" = 'e.raoofi'
WHERE "username" = 'admin@mehr.local'
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS existing WHERE existing."username" = 'e.raoofi'
  );

UPDATE "User"
SET "passwordHash" = '$2b$10$IPLN8clfTuOnmAc6c5h0aOH/S9Q6h9FoOMp3PvBN4yM5TOoa5zv.y'
WHERE "username" = 'e.raoofi';

DELETE FROM "RefreshToken"
WHERE "userId" IN (
  SELECT "id" FROM "User" WHERE "username" = 'e.raoofi'
);
