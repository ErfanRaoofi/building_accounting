import { ChargeInvoiceStatus, Prisma, ReceiptKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../common/jalali';

type Db = Prisma.TransactionClient | PrismaService;

export function invoiceStatus(amount: number, paidAmount: number): ChargeInvoiceStatus {
  if (paidAmount <= 0) {
    return ChargeInvoiceStatus.UNPAID;
  }
  if (paidAmount >= amount) {
    return ChargeInvoiceStatus.PAID;
  }
  return ChargeInvoiceStatus.PARTIAL;
}

export async function creditOf(tx: Db, unitId: string, fiscalYearId: string) {
  const sum = await tx.receiptLine.aggregate({
    where: {
      chargeInvoiceId: null,
      receipt: { unitId, fiscalYearId, receiptType: { kind: ReceiptKind.CHARGE } },
    },
    _sum: { amount: true },
  });
  return money(sum._sum.amount || 0);
}

export async function creditsByUnit(tx: Db, fiscalYearId: string) {
  const lines = await tx.receiptLine.findMany({
    where: {
      chargeInvoiceId: null,
      receipt: { fiscalYearId, unitId: { not: null }, receiptType: { kind: ReceiptKind.CHARGE } },
    },
    select: { amount: true, receipt: { select: { unitId: true } } },
  });
  const map = new Map<string, number>();
  for (const line of lines) {
    const unitId = line.receipt.unitId;
    if (!unitId) {
      continue;
    }
    map.set(unitId, (map.get(unitId) || 0) + money(line.amount));
  }
  return map;
}

export async function allocateCredit(tx: Prisma.TransactionClient, unitId: string, fiscalYearId: string) {
  const invoices = await tx.chargeInvoice.findMany({
    where: { unitId, fiscalYearId },
    orderBy: [{ jalaliYear: 'asc' }, { jalaliMonth: 'asc' }],
  });
  const state = invoices.map((invoice) => ({
    id: invoice.id,
    amount: money(invoice.amount),
    paidAmount: money(invoice.paidAmount),
    remaining: money(invoice.amount) - money(invoice.paidAmount),
  }));
  const lines = await tx.receiptLine.findMany({
    where: {
      chargeInvoiceId: null,
      receipt: { unitId, fiscalYearId, receiptType: { kind: ReceiptKind.CHARGE } },
    },
    include: { receipt: { select: { date: true } } },
  });
  lines.sort((a, b) => +a.receipt.date - +b.receipt.date || a.id.localeCompare(b.id));
  for (const line of lines) {
    let leftover = money(line.amount);
    for (const invoice of state) {
      if (leftover <= 0 || invoice.remaining <= 0) {
        continue;
      }
      const apply = Math.min(invoice.remaining, leftover);
      await tx.receiptLine.create({
        data: {
          receiptId: line.receiptId,
          chargeInvoiceId: invoice.id,
          amount: apply,
          description: line.description || 'تسویه از بستانکاری',
        },
      });
      leftover -= apply;
      invoice.paidAmount += apply;
      invoice.remaining -= apply;
      await tx.chargeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: invoice.paidAmount,
          status: invoiceStatus(invoice.amount, invoice.paidAmount),
        },
      });
    }
    if (leftover <= 0) {
      await tx.receiptLine.delete({ where: { id: line.id } });
    } else if (leftover !== money(line.amount)) {
      await tx.receiptLine.update({ where: { id: line.id }, data: { amount: leftover } });
    }
  }
}

export async function settleFiscalYearCredits(tx: Prisma.TransactionClient, fiscalYearId: string) {
  const rows = await tx.receipt.findMany({
    where: {
      fiscalYearId,
      unitId: { not: null },
      receiptType: { kind: ReceiptKind.CHARGE },
      lines: { some: { chargeInvoiceId: null } },
    },
    select: { unitId: true },
    distinct: ['unitId'],
  });
  for (const row of rows) {
    if (row.unitId) {
      await allocateCredit(tx, row.unitId, fiscalYearId);
    }
  }
}
