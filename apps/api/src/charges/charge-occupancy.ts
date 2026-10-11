import { ChargeInvoiceStatus, OccupancyStatus, Prisma } from '@prisma/client';
import { money } from '../common/jalali';
import { invoiceStatus } from './charge-credit';
import { monthlyChargeFor } from './charge-rate';

type RatedUnit = {
  id: string;
  customMonthlyCharge: { toString(): string } | null;
  tariff?: { monthlyAmount: { toString(): string } } | null;
};

export async function repriceInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  occupancy: OccupancyStatus,
  newAmount: number,
) {
  const invoice = await tx.chargeInvoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true },
  });
  if (!invoice) {
    return;
  }
  const paid = money(invoice.paidAmount);
  if (paid <= newAmount) {
    await tx.chargeInvoice.update({
      where: { id: invoiceId },
      data: { occupancy, amount: newAmount, status: invoiceStatus(newAmount, paid) },
    });
    return;
  }

  let excess = paid - newAmount;
  const lines = [...invoice.lines].sort((a, b) => b.id.localeCompare(a.id));
  for (const line of lines) {
    if (excess <= 0) {
      break;
    }
    const lineAmount = money(line.amount);
    const peel = Math.min(lineAmount, excess);
    if (peel >= lineAmount) {
      await tx.receiptLine.update({
        where: { id: line.id },
        data: { chargeInvoiceId: null, description: line.description || 'مابه‌التفاوت شارژ' },
      });
    } else {
      await tx.receiptLine.update({ where: { id: line.id }, data: { amount: lineAmount - peel } });
      await tx.receiptLine.create({
        data: {
          receiptId: line.receiptId,
          paymentId: line.paymentId,
          amount: peel,
          description: 'مابه‌التفاوت شارژ',
        },
      });
    }
    excess -= peel;
  }

  await tx.chargeInvoice.update({
    where: { id: invoiceId },
    data: {
      occupancy,
      amount: newAmount,
      paidAmount: newAmount,
      status: ChargeInvoiceStatus.PAID,
    },
  });
}

export async function applyUnitOccupancy(
  tx: Prisma.TransactionClient,
  unit: RatedUnit,
  occupancy: OccupancyStatus,
  fromYear: number,
  fromMonth: number,
  fiscalYearIds: string[],
  vacantMonthlyCharge: number,
  onlyOpenDebts: boolean,
) {
  if (!fiscalYearIds.length) {
    return;
  }
  const invoices = await tx.chargeInvoice.findMany({
    where: { unitId: unit.id, fiscalYearId: { in: fiscalYearIds } },
  });
  const amount = monthlyChargeFor(unit, occupancy, vacantMonthlyCharge);
  for (const invoice of invoices) {
    const due =
      invoice.jalaliYear > fromYear || (invoice.jalaliYear === fromYear && invoice.jalaliMonth >= fromMonth);
    if (!due) {
      continue;
    }
    if (onlyOpenDebts && invoice.status === ChargeInvoiceStatus.PAID) {
      continue;
    }
    if (invoice.occupancy === occupancy && money(invoice.amount) === amount) {
      continue;
    }
    await repriceInvoice(tx, invoice.id, occupancy, amount);
  }
}
