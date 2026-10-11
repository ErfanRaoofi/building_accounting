import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, Prisma, ReceiptKind } from '@prisma/client';

type Db = Prisma.TransactionClient;

export async function findChargeReceiptType(tx: Db, buildingId: string) {
  const type = await tx.receiptType.findFirst({
    where: { buildingId, kind: ReceiptKind.CHARGE },
    orderBy: { createdAt: 'asc' },
  });
  if (!type) {
    throw new BadRequestException('نوع دریافت شارژ برای این ساختمان تعریف نشده است');
  }
  return type;
}

export async function nextReceiptNumber(tx: Db, buildingId: string, fiscalYearId: string, title: string) {
  const rows = await tx.receipt.findMany({
    where: { buildingId, fiscalYearId },
    select: { number: true },
  });
  const max = rows.reduce((highest, row) => {
    const match = row.number.match(/-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `R-${title}-${String(max + 1).padStart(4, '0')}`;
}

export async function ensureUnitReceipt(
  tx: Db,
  params: {
    buildingId: string;
    fiscalYearId: string;
    unitId: string;
    createdById: string;
    title: string;
  },
) {
  const existing = await tx.receipt.findFirst({
    where: { fiscalYearId: params.fiscalYearId, unitId: params.unitId },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) {
    return existing;
  }
  const type = await findChargeReceiptType(tx, params.buildingId);
  const number = await nextReceiptNumber(tx, params.buildingId, params.fiscalYearId, params.title);
  return tx.receipt.create({
    data: {
      buildingId: params.buildingId,
      fiscalYearId: params.fiscalYearId,
      receiptTypeId: type.id,
      unitId: params.unitId,
      number,
      date: new Date(),
      totalAmount: 0,
      paymentMethod: PaymentMethod.CASH,
      createdById: params.createdById,
    },
  });
}

export async function ensureUnitReceiptsForFiscalYear(
  tx: Db,
  params: {
    buildingId: string;
    fiscalYearId: string;
    title: string;
    createdById: string;
  },
) {
  const units = await tx.unit.findMany({
    where: { buildingId: params.buildingId, isActive: true },
    select: { id: true },
  });
  for (const unit of units) {
    await ensureUnitReceipt(tx, {
      buildingId: params.buildingId,
      fiscalYearId: params.fiscalYearId,
      unitId: unit.id,
      createdById: params.createdById,
      title: params.title,
    });
  }
}
