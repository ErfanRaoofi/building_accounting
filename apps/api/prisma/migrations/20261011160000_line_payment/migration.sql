-- Each charge allocation belongs to one deposit, not the whole unit document.
ALTER TABLE "ReceiptLine" ADD COLUMN "paymentId" TEXT;

CREATE TEMP TABLE "_line_left" (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  invoice_id TEXT,
  description TEXT,
  left_amt NUMERIC NOT NULL
) ON COMMIT DROP;

INSERT INTO "_line_left" (id, receipt_id, invoice_id, description, left_amt)
SELECT l.id, l."receiptId", l."chargeInvoiceId", l.description, l.amount
FROM "ReceiptLine" l
WHERE l."paymentId" IS NULL;

CREATE TEMP TABLE "_pay_room" (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  room NUMERIC NOT NULL,
  ord INT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_pay_room" (id, receipt_id, room, ord)
SELECT
  p.id,
  p."receiptId",
  p.amount,
  ROW_NUMBER() OVER (PARTITION BY p."receiptId" ORDER BY p.date, p."createdAt", p.id)
FROM "ReceiptPayment" p
JOIN "ReceiptType" t ON t.id = p."receiptTypeId" AND t.kind = 'CHARGE';

DO $$
DECLARE
  rec RECORD;
  pay RECORD;
  remain NUMERIC;
  slice NUMERIC;
  assigned NUMERIC;
BEGIN
  FOR rec IN
    SELECT * FROM "_line_left"
    ORDER BY receipt_id, CASE WHEN invoice_id IS NULL THEN 1 ELSE 0 END, id
  LOOP
    remain := rec.left_amt;
    assigned := 0;
    FOR pay IN
      SELECT * FROM "_pay_room"
      WHERE receipt_id = rec.receipt_id AND room > 0
      ORDER BY ord
    LOOP
      EXIT WHEN remain <= 0;
      slice := LEAST(remain, pay.room);
      IF slice <= 0 THEN
        CONTINUE;
      END IF;
      IF assigned = 0 THEN
        UPDATE "ReceiptLine"
        SET "paymentId" = pay.id, amount = slice
        WHERE id = rec.id;
      ELSE
        INSERT INTO "ReceiptLine" (id, "receiptId", "paymentId", "chargeInvoiceId", amount, description)
        VALUES (gen_random_uuid()::text, rec.receipt_id, pay.id, rec.invoice_id, slice, rec.description);
      END IF;
      UPDATE "_pay_room" SET room = room - slice WHERE id = pay.id;
      remain := remain - slice;
      assigned := assigned + slice;
    END LOOP;

    IF remain > 0 AND rec.invoice_id IS NOT NULL THEN
      UPDATE "ChargeInvoice" ci
      SET
        "paidAmount" = GREATEST(0, ci."paidAmount" - remain),
        status = CASE
          WHEN GREATEST(0, ci."paidAmount" - remain) <= 0 THEN 'UNPAID'::"ChargeInvoiceStatus"
          WHEN GREATEST(0, ci."paidAmount" - remain) >= ci.amount THEN 'PAID'::"ChargeInvoiceStatus"
          ELSE 'PARTIAL'::"ChargeInvoiceStatus"
        END
      WHERE ci.id = rec.invoice_id;
    END IF;

    IF assigned = 0 THEN
      DELETE FROM "ReceiptLine" WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

DELETE FROM "ReceiptLine" WHERE "paymentId" IS NULL;

ALTER TABLE "ReceiptLine" ALTER COLUMN "paymentId" SET NOT NULL;

ALTER TABLE "ReceiptLine"
  ADD CONSTRAINT "ReceiptLine_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "ReceiptPayment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ReceiptLine_paymentId_idx" ON "ReceiptLine"("paymentId");
CREATE INDEX IF NOT EXISTS "ReceiptLine_chargeInvoiceId_idx" ON "ReceiptLine"("chargeInvoiceId");
