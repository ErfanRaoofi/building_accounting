ALTER TABLE "Payment"
ADD COLUMN "depositAmount" DECIMAL(18,0) NOT NULL DEFAULT 0,
ADD COLUMN "balance" DECIMAL(18,0),
ADD COLUMN "transactionTime" TEXT,
ADD COLUMN "operation" TEXT,
ADD COLUMN "documentNumber" TEXT,
ADD COLUMN "depositReference" TEXT,
ADD COLUMN "trackingNumber" TEXT;
