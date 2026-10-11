-- AlterTable: add payment type (nullable for backfill)
ALTER TABLE "ReceiptPayment" ADD COLUMN "receiptTypeId" TEXT;

-- Backfill payment type from parent receipt
UPDATE "ReceiptPayment" AS p
SET "receiptTypeId" = r."receiptTypeId"
FROM "Receipt" AS r
WHERE p."receiptId" = r."id";

-- Merge multiple receipts for the same unit + fiscal year into one keeper
DO $$
DECLARE
  grp RECORD;
  keeper_id TEXT;
  other RECORD;
BEGIN
  FOR grp IN
    SELECT "fiscalYearId", "unitId"
    FROM "Receipt"
    WHERE "unitId" IS NOT NULL
    GROUP BY "fiscalYearId", "unitId"
    HAVING COUNT(*) > 1
  LOOP
    SELECT r.id INTO keeper_id
    FROM "Receipt" r
    JOIN "ReceiptType" t ON t.id = r."receiptTypeId"
    WHERE r."fiscalYearId" = grp."fiscalYearId"
      AND r."unitId" = grp."unitId"
    ORDER BY
      CASE WHEN t.kind = 'CHARGE' THEN 0 ELSE 1 END,
      r."createdAt" ASC
    LIMIT 1;

    FOR other IN
      SELECT id
      FROM "Receipt"
      WHERE "fiscalYearId" = grp."fiscalYearId"
        AND "unitId" = grp."unitId"
        AND id <> keeper_id
    LOOP
      UPDATE "ReceiptPayment" SET "receiptId" = keeper_id WHERE "receiptId" = other.id;
      UPDATE "ReceiptLine" SET "receiptId" = keeper_id WHERE "receiptId" = other.id;
      UPDATE "PaymentRequest" SET "receiptId" = keeper_id WHERE "receiptId" = other.id;
      DELETE FROM "Receipt" WHERE id = other.id;
    END LOOP;

    UPDATE "Receipt" AS r
    SET "totalAmount" = COALESCE((
      SELECT SUM(p.amount) FROM "ReceiptPayment" p WHERE p."receiptId" = keeper_id
    ), 0)
    WHERE r.id = keeper_id;
  END LOOP;
END $$;

-- Failsafe: any remaining null payment types take CHARGE type of that building
UPDATE "ReceiptPayment" AS p
SET "receiptTypeId" = t.id
FROM "Receipt" AS r
JOIN "ReceiptType" AS t ON t."buildingId" = r."buildingId" AND t.kind = 'CHARGE'
WHERE p."receiptId" = r.id
  AND p."receiptTypeId" IS NULL;

-- Require payment type
ALTER TABLE "ReceiptPayment" ALTER COLUMN "receiptTypeId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ReceiptPayment"
  ADD CONSTRAINT "ReceiptPayment_receiptTypeId_fkey"
  FOREIGN KEY ("receiptTypeId") REFERENCES "ReceiptType"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- One unit document per fiscal year
CREATE UNIQUE INDEX "Receipt_fiscalYearId_unitId_key"
  ON "Receipt"("fiscalYearId", "unitId")
  WHERE "unitId" IS NOT NULL;

CREATE INDEX "Receipt_fiscalYearId_unitId_idx" ON "Receipt"("fiscalYearId", "unitId");

-- Seed empty unit receipts for open fiscal years
INSERT INTO "Receipt" (
  "id",
  "buildingId",
  "fiscalYearId",
  "receiptTypeId",
  "unitId",
  "number",
  "date",
  "totalAmount",
  "paymentMethod",
  "description",
  "createdById",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  u."buildingId",
  fy.id,
  rt.id,
  u.id,
  'R-' || fy.title || '-' || LPAD((
    COALESCE((
      SELECT MAX(NULLIF(substring(r2.number from '([0-9]+)$'), '')::int)
      FROM "Receipt" r2
      WHERE r2."buildingId" = u."buildingId" AND r2."fiscalYearId" = fy.id
    ), 0)
    + ROW_NUMBER() OVER (PARTITION BY fy.id ORDER BY u.number)
  )::text, 4, '0'),
  CURRENT_DATE,
  0,
  'CASH',
  NULL,
  COALESCE(
    (SELECT ba."userId" FROM "BuildingAccess" ba WHERE ba."buildingId" = u."buildingId" LIMIT 1),
    (SELECT usr.id FROM "User" usr ORDER BY usr."createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP
FROM "Unit" u
JOIN "FiscalYear" fy ON fy."buildingId" = u."buildingId" AND fy.status = 'OPEN'
JOIN "ReceiptType" rt ON rt."buildingId" = u."buildingId" AND rt.kind = 'CHARGE'
WHERE u."isActive" = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM "Receipt" r
    WHERE r."unitId" = u.id AND r."fiscalYearId" = fy.id
  )
  AND COALESCE(
    (SELECT ba."userId" FROM "BuildingAccess" ba WHERE ba."buildingId" = u."buildingId" LIMIT 1),
    (SELECT usr.id FROM "User" usr ORDER BY usr."createdAt" ASC LIMIT 1)
  ) IS NOT NULL;
