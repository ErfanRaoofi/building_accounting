ALTER TYPE "PaymentRequestStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

ALTER TABLE "PaymentRequest" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "PaymentRequest" ADD COLUMN "receiptPaymentId" TEXT;

CREATE UNIQUE INDEX "PaymentRequest_receiptPaymentId_key" ON "PaymentRequest"("receiptPaymentId");

ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_receiptPaymentId_fkey" FOREIGN KEY ("receiptPaymentId") REFERENCES "ReceiptPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH ranked AS (
  SELECT
    pr.id AS request_id,
    p.id AS payment_id,
    ROW_NUMBER() OVER (PARTITION BY pr.id ORDER BY p."createdAt" DESC) AS request_rank,
    ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY pr."createdAt" DESC) AS payment_rank
  FROM "PaymentRequest" pr
  JOIN "ReceiptPayment" p
    ON p."receiptId" = pr."receiptId"
   AND p.amount = pr.amount
   AND p.date = pr.date
   AND p.description LIKE '%تأیید درخواست پرداخت ساکن%'
  WHERE pr.status = 'APPROVED'
    AND pr."receiptId" IS NOT NULL
)
UPDATE "PaymentRequest" pr
SET "receiptPaymentId" = ranked.payment_id
FROM ranked
WHERE pr.id = ranked.request_id
  AND ranked.request_rank = 1
  AND ranked.payment_rank = 1;
