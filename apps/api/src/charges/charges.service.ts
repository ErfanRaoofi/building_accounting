import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { JALALI_MONTHS, money, monthsBetween } from '../common/jalali';
import { compareUnitNumber } from '../common/unit-number';
import { UnitsService } from '../units/units.service';
import { allocateCredit, creditOf, invoiceStatus } from './charge-credit';
import { STAFF_ROLES } from '../common/roles';

@Injectable()
export class ChargesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private units: UnitsService,
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
      await this.prisma.$transaction((tx) => this.allocateCredit(tx, unitId, fiscalYearId));
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
    return { items, credit };
  }

  async generate(user: AuthUser, fiscalYearId: string) {
    const fy = await this.access.assertOpenFiscalYear(user, fiscalYearId, STAFF_ROLES);
    const units = await this.prisma.unit.findMany({
      where: { buildingId: fy.buildingId, isActive: true },
      include: { tariff: true },
    });
    const months = monthsBetween(fy.startDate, fy.endDate);
    if (!months.length) {
      throw new BadRequestException('بازه سال مالی نامعتبر است');
    }
    const data = units.flatMap((unit) => {
      const amount = this.units.monthlyChargeOf(unit);
      if (amount <= 0) {
        return [];
      }
      return months.map((month) => ({
        unitId: unit.id,
        fiscalYearId: fy.id,
        jalaliYear: month.year,
        jalaliMonth: month.month,
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
    const amount = this.units.monthlyChargeOf(unit);
    if (amount <= 0) {
      return;
    }
    const months = monthsBetween(fy.startDate, fy.endDate);
    await this.prisma.chargeInvoice.createMany({
      data: months.map((month) => ({
        unitId: unit.id,
        fiscalYearId: fy.id,
        jalaliYear: month.year,
        jalaliMonth: month.month,
        amount,
      })),
      skipDuplicates: true,
    });
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
