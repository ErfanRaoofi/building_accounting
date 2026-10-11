-- Reconcile unit receipt lines so only CHARGE payments allocate to invoices/prepaid.
-- Excess null-invoice lines (often from entrance/other mistaken as charge credit) are peeled.

DO $$
DECLARE
  rec RECORD;
  charge_total NUMERIC;
  line_sum NUMERIC;
  need NUMERIC;
  line RECORD;
  amt NUMERIC;
BEGIN
  FOR rec IN
    SELECT r.id
    FROM "Receipt" r
    WHERE r."unitId" IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(p.amount), 0) INTO charge_total
    FROM "ReceiptPayment" p
    JOIN "ReceiptType" t ON t.id = p."receiptTypeId"
    WHERE p."receiptId" = rec.id AND t.kind = 'CHARGE';

    SELECT COALESCE(SUM(l.amount), 0) INTO line_sum
    FROM "ReceiptLine" l
    WHERE l."receiptId" = rec.id;

    IF line_sum <= charge_total THEN
      CONTINUE;
    END IF;

    need := line_sum - charge_total;

    -- Peel prepaid (null invoice) first, then billed lines from the end
    FOR line IN
      SELECT l.id, l.amount, l."chargeInvoiceId"
      FROM "ReceiptLine" l
      WHERE l."receiptId" = rec.id
      ORDER BY
        CASE WHEN l."chargeInvoiceId" IS NULL THEN 0 ELSE 1 END,
        l.id DESC
    LOOP
      EXIT WHEN need <= 0;
      amt := line.amount;
      IF amt <= need THEN
        -- reverse invoice paid if needed
        IF line."chargeInvoiceId" IS NOT NULL THEN
          UPDATE "ChargeInvoice" ci
          SET
            "paidAmount" = GREATEST(0, ci."paidAmount" - amt),
            status = CASE
              WHEN GREATEST(0, ci."paidAmount" - amt) <= 0 THEN 'UNPAID'::"ChargeInvoiceStatus"
              WHEN GREATEST(0, ci."paidAmount" - amt) >= ci.amount THEN 'PAID'::"ChargeInvoiceStatus"
              ELSE 'PARTIAL'::"ChargeInvoiceStatus"
            END
          WHERE ci.id = line."chargeInvoiceId";
        END IF;
        DELETE FROM "ReceiptLine" WHERE id = line.id;
        need := need - amt;
      ELSE
        IF line."chargeInvoiceId" IS NOT NULL THEN
          UPDATE "ChargeInvoice" ci
          SET
            "paidAmount" = GREATEST(0, ci."paidAmount" - need),
            status = CASE
              WHEN GREATEST(0, ci."paidAmount" - need) <= 0 THEN 'UNPAID'::"ChargeInvoiceStatus"
              WHEN GREATEST(0, ci."paidAmount" - need) >= ci.amount THEN 'PAID'::"ChargeInvoiceStatus"
              ELSE 'PARTIAL'::"ChargeInvoiceStatus"
            END
          WHERE ci.id = line."chargeInvoiceId";
        END IF;
        UPDATE "ReceiptLine" SET amount = amt - need WHERE id = line.id;
        need := 0;
      END IF;
    END LOOP;
  END LOOP;
END $$;
