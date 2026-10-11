ALTER TABLE "Building" ADD COLUMN "vacantMonthlyCharge" DECIMAL(18,0) NOT NULL DEFAULT 9000000;

ALTER TABLE "ChargeInvoice" ADD COLUMN "occupancy" "OccupancyStatus" NOT NULL DEFAULT 'OCCUPIED';

CREATE TABLE "ReceiptPayment" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReceiptPayment_receiptId_date_idx" ON "ReceiptPayment"("receiptId", "date");

ALTER TABLE "ReceiptPayment" ADD CONSTRAINT "ReceiptPayment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ReceiptPayment" ("id", "receiptId", "date", "amount", "paymentMethod", "description", "createdAt")
SELECT gen_random_uuid()::text, "id", "date", "totalAmount", "paymentMethod", "description", "createdAt"
FROM "Receipt";

UPDATE "ChargeInvoice" AS i
SET "occupancy" = 'VACANT',
    "amount" = b."vacantMonthlyCharge"
FROM "Unit" AS u
JOIN "Building" AS b ON b."id" = u."buildingId"
WHERE i."unitId" = u."id"
  AND u."occupancy" = 'VACANT'
  AND i."status" = 'UNPAID';
