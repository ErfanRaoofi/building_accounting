import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OccupancyStatus, PaymentMethod, Prisma, ReceiptKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { JALALI_MONTHS, money, monthsBetween, toJalali } from '../common/jalali';
import { compareUnitNumber } from '../common/unit-number';
import { ensureUnitReceipt } from '../receipts/unit-receipt';
import { allocateCredit, creditOf, invoiceStatus } from './charge-credit';
import { repriceInvoice } from './charge-occupancy';
import { DEFAULT_VACANT_MONTHLY_CHARGE, monthlyChargeFor } from './charge-rate';
import { STAFF_ROLES } from '../common/roles';

@Injectable()
export class ChargesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(user: AuthUser, fiscalYearId: string, unitId?: string) {
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!fy) {
      throw new NotFoundException('سال مالی یافت نشد');
    }
    await this.access.assertRoles(user, fy.buildingId, STAFF_ROLES);
    if (unitId) {
      if (fy.status === 'OPEN') {
        await this.ensureUnitMonths(fy, unitId);
      }
    }
    const rows = await this.prisma.chargeInvoice.findMany({
      where: { fiscalYearId, ...(unitId ? { unitId } : {}) },
      include: { unit: true },
    });
    const items = rows
      .sort(
        (a, b) =>
          compareUnitNumber(a.unit.number, b.unit.number) ||
          a.jalaliYear - b.jalaliYear ||
          a.jalaliMonth - b.jalaliMonth,
      )
      .map((r) => this.map(r));
    const credit = unitId ? await this.creditOf(unitId, fiscalYearId) : 0;
    const chargeReceipt = unitId ? await this.chargeReceiptOf(fiscalYearId, unitId) : null;
    return { items, credit, chargeReceipt };
  }

  async setInvoiceOccupancy(user: AuthUser, invoiceId: string, occupancy: OccupancyStatus) {
    const invoice = await this.prisma.chargeInvoice.findUnique({
      where: { id: invoiceId },
      include: { unit: { include: { tariff: true } }, fiscalYear: true },
    });
    if (!invoice) {
      throw new NotFoundException('شارژ ماه یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, invoice.fiscalYearId, STAFF_ROLES);
    const vacant = await this.vacantRate(invoice.unit.buildingId);
    const amount = monthlyChargeFor(invoice.unit, occupancy, vacant);
    await this.prisma.$transaction(async (tx) => {
      await repriceInvoice(tx, invoice.id, occupancy, amount);
      const today = toJalali(new Date());
      if (invoice.jalaliYear === today.jy && invoice.jalaliMonth === today.jm) {
        await tx.unit.update({ where: { id: invoice.unitId }, data: { occupancy } });
      }
    });
    const updated = await this.prisma.chargeInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    return this.map(updated);
  }

  async setInvoicePaid(user: AuthUser, invoiceId: string, paidAmount: number) {
    const invoice = await this.prisma.chargeInvoice.findUnique({
      where: { id: invoiceId },
      include: { fiscalYear: true },
    });
    if (!invoice) {
      throw new NotFoundException('شارژ ماه یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, invoice.fiscalYearId, STAFF_ROLES);
    const amount = money(invoice.amount);
    const nextPaid = Math.round(paidAmount);
    if (nextPaid > amount) {
      throw new BadRequestException('مبلغ دریافتی از شارژ این ماه بیشتر است');
    }
    const previousPaid = money(invoice.paidAmount);
    if (nextPaid === previousPaid) {
      return this.map(invoice);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.chargeInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount: nextPaid, status: invoiceStatus(amount, nextPaid) },
      });
      await this.syncMonthOnChargeReceipt(tx, invoice, nextPaid, user.id);
    });
    const updated = await this.prisma.chargeInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    return this.map(updated);
  }

  private async syncMonthOnChargeReceipt(
    tx: Prisma.TransactionClient,
    invoice: { id: string; unitId: string; fiscalYearId: string; jalaliYear: number; jalaliMonth: number; fiscalYear: { title: string; buildingId: string } },
    paidAmount: number,
    userId: string,
  ) {
    const monthTitle = `${JALALI_MONTHS[invoice.jalaliMonth - 1]} ${invoice.jalaliYear}`;
    let receipt = await tx.receipt.findFirst({
      where: {
        fiscalYearId: invoice.fiscalYearId,
        unitId: invoice.unitId,
      },
      orderBy: { createdAt: 'asc' },
    });
    const chargeLines = await tx.receiptLine.findMany({
      where: {
        chargeInvoiceId: invoice.id,
        payment: { receiptType: { kind: ReceiptKind.CHARGE } },
      },
      orderBy: { id: 'desc' },
    });
    const current = chargeLines.reduce((sum, line) => sum + money(line.amount), 0);
    const delta = paidAmount - current;
    if (delta === 0) {
      return;
    }
    if (!receipt && delta <= 0) {
      return;
    }
    if (!receipt) {
      receipt = await ensureUnitReceipt(tx, {
        buildingId: invoice.fiscalYear.buildingId,
        fiscalYearId: invoice.fiscalYearId,
        unitId: invoice.unitId,
        createdById: userId,
        title: invoice.fiscalYear.title,
      });
    }

    if (delta > 0) {
      const latest = await tx.receiptPayment.findFirst({
        where: { receiptId: receipt.id, receiptType: { kind: ReceiptKind.CHARGE } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
      const payment = latest
        ? await tx.receiptPayment.update({
            where: { id: latest.id },
            data: { amount: money(latest.amount) + delta },
          })
        : await tx.receiptPayment.create({
            data: {
              receiptId: receipt.id,
              receiptTypeId: receipt.receiptTypeId,
              date: new Date(),
              amount: delta,
              paymentMethod: PaymentMethod.CASH,
              description: monthTitle,
            },
          });
      await tx.receiptLine.create({
        data: {
          receiptId: receipt.id,
          paymentId: payment.id,
          chargeInvoiceId: invoice.id,
          amount: delta,
          description: monthTitle,
        },
      });
    } else {
      let peel = -delta;
      const touched = new Set<string>();
      for (const line of chargeLines) {
        if (peel <= 0) {
          break;
        }
        const lineAmount = money(line.amount);
        const take = Math.min(lineAmount, peel);
        if (take >= lineAmount) {
          await tx.receiptLine.delete({ where: { id: line.id } });
        } else {
          await tx.receiptLine.update({ where: { id: line.id }, data: { amount: lineAmount - take } });
        }
        touched.add(line.paymentId);
        peel -= take;
      }
      for (const paymentId of touched) {
        const left = await tx.receiptLine.aggregate({ where: { paymentId }, _sum: { amount: true } });
        const sum = money(left._sum.amount || 0);
        if (sum <= 0) {
          await tx.receiptPayment.delete({ where: { id: paymentId } });
        } else {
          await tx.receiptPayment.update({ where: { id: paymentId }, data: { amount: sum } });
        }
      }
    }

    const payments = await tx.receiptPayment.findMany({ where: { receiptId: receipt.id } });
    const total = payments.reduce((sum, payment) => sum + money(payment.amount), 0);
    await tx.receipt.update({ where: { id: receipt.id }, data: { totalAmount: total } });
  }

  async generate(user: AuthUser, fiscalYearId: string) {
    const fy = await this.access.assertOpenFiscalYear(user, fiscalYearId, STAFF_ROLES);
    const units = await this.prisma.unit.findMany({
      where: { buildingId: fy.buildingId, isActive: true },
      include: { tariff: true },
    });
    const vacant = await this.vacantRate(fy.buildingId);
    const months = monthsBetween(fy.startDate, fy.endDate);
    if (!months.length) {
      throw new BadRequestException('بازه سال مالی نامعتبر است');
    }
    const data = units.flatMap((unit) => {
      const amount = monthlyChargeFor(unit, unit.occupancy, vacant);
      if (amount <= 0) {
        return [];
      }
      return months.map((month) => ({
        unitId: unit.id,
        fiscalYearId: fy.id,
        jalaliYear: month.year,
        jalaliMonth: month.month,
        occupancy: unit.occupancy,
        amount,
      }));
    });
    const result = await this.prisma.chargeInvoice.createMany({
      data,
      skipDuplicates: true,
    });
    await this.prisma.$transaction(async (tx) => {
      for (const unit of units) {
        await this.allocateCredit(tx, unit.id, fy.id);
      }
    });
    return { created: result.count, months: months.length, units: units.length };
  }

  private async ensureUnitMonths(fy: { id: string; buildingId: string; startDate: Date; endDate: Date }, unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: { tariff: true },
    });
    if (!unit || unit.buildingId !== fy.buildingId) {
      throw new BadRequestException('واحد متعلق به این ساختمان نیست');
    }
    const vacant = await this.vacantRate(unit.buildingId);
    const amount = monthlyChargeFor(unit, unit.occupancy, vacant);
    if (amount <= 0) {
      return;
    }
    const months = monthsBetween(fy.startDate, fy.endDate);
    if (!months.length) {
      return;
    }
    await this.prisma.chargeInvoice.createMany({
      data: months.map((month) => ({
        unitId: unit.id,
        fiscalYearId: fy.id,
        jalaliYear: month.year,
        jalaliMonth: month.month,
        occupancy: unit.occupancy,
        amount,
      })),
      skipDuplicates: true,
    });
  }

  private async vacantRate(buildingId: string) {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { vacantMonthlyCharge: true },
    });
    return money(building?.vacantMonthlyCharge ?? DEFAULT_VACANT_MONTHLY_CHARGE);
  }

  private async chargeReceiptOf(fiscalYearId: string, unitId: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { fiscalYearId, unitId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, number: true, totalAmount: true },
    });
    if (!receipt) {
      return null;
    }
    return { ...receipt, totalAmount: money(receipt.totalAmount) };
  }

  creditOf(unitId: string, fiscalYearId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return creditOf(tx, unitId, fiscalYearId);
  }

  allocateCredit(tx: Prisma.TransactionClient, unitId: string, fiscalYearId: string) {
    return allocateCredit(tx, unitId, fiscalYearId);
  }

  map(row: any) {
    const amount = money(row.amount);
    const paidAmount = money(row.paidAmount);
    return {
      ...row,
      amount,
      paidAmount,
      remaining: amount - paidAmount,
      monthTitle: `${JALALI_MONTHS[row.jalaliMonth - 1]} ${row.jalaliYear}`,
    };
  }

  invoiceStatus(amount: number, paidAmount: number) {
    return invoiceStatus(amount, paidAmount);
  }
}
