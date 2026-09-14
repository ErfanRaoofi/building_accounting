import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateUnitDto, UpdateUnitDto } from './dto';
import { JALALI_MONTHS, money } from '../common/jalali';
import { sortByUnitNumber } from '../common/unit-number';
import { pageRows, paginateQuery, type Pagination } from '../common/pagination';
import { allocateCredit, creditOf } from '../charges/charge-credit';
import { RESIDENT_ROLES, STAFF_ROLES } from '../common/roles';

@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(user: AuthUser, buildingId: string, pagination: Pagination) {
    const access = await this.access.getAccess(user, buildingId);
    const where: Prisma.UnitWhereInput = { buildingId };
    if (!this.access.hasAnyRole(access, STAFF_ROLES)) {
      if (!this.access.hasAnyRole(access, RESIDENT_ROLES)) {
        throw new ForbiddenException('دسترسی کافی نیست');
      }
      where.id = { in: await this.access.residentUnitIds(user, buildingId) };
    }
    const rows = await this.prisma.unit.findMany({
      where,
      include: { tariff: true },
    });
    const mapped = sortByUnitNumber(rows, (u) => u.number).map((u) => this.map(u));
    return pageRows(mapped, pagination);
  }

  async create(user: AuthUser, dto: CreateUnitDto) {
    await this.access.assertRoles(user, dto.buildingId, STAFF_ROLES);
    const row = await this.prisma.unit.create({
      data: {
        buildingId: dto.buildingId,
        number: dto.number,
        floor: dto.floor,
        area: dto.area,
        bedrooms: dto.bedrooms,
        occupancy: dto.occupancy,
        ownerName: dto.ownerName,
        residentName: dto.residentName,
        phone: dto.phone,
        tariffId: dto.tariffId,
        customMonthlyCharge: dto.customMonthlyCharge,
      },
      include: { tariff: true },
    });
    return this.map(row);
  }

  async update(user: AuthUser, id: string, dto: UpdateUnitDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) {
      throw new NotFoundException('واحد یافت نشد');
    }
    await this.access.assertRoles(user, unit.buildingId, STAFF_ROLES);
    const row = await this.prisma.unit.update({
      where: { id },
      data: {
        number: dto.number,
        floor: dto.floor,
        area: dto.area,
        bedrooms: dto.bedrooms,
        occupancy: dto.occupancy,
        ownerName: dto.ownerName,
        residentName: dto.residentName,
        phone: dto.phone,
        tariffId: dto.tariffId,
        customMonthlyCharge: dto.customMonthlyCharge,
        isActive: dto.isActive,
      },
      include: { tariff: true },
    });
    return this.map(row);
  }

  async ledger(
    user: AuthUser,
    id: string,
    fiscalYearId: string,
    pagination: { invoices: Pagination; receipts: Pagination },
  ) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) {
      throw new NotFoundException('واحد یافت نشد');
    }
    await this.access.assertUnitReadable(user, id);
    await this.prisma.$transaction((tx) => allocateCredit(tx, id, fiscalYearId));
    const invoiceWhere = { unitId: id, fiscalYearId };
    const receiptWhere = { unitId: id, fiscalYearId };
    const [invoices, receipts] = await Promise.all([
      paginateQuery(
        pagination.invoices,
        () => this.prisma.chargeInvoice.count({ where: invoiceWhere }),
        (skip, take) =>
          this.prisma.chargeInvoice.findMany({
            where: invoiceWhere,
            orderBy: [{ jalaliYear: 'asc' }, { jalaliMonth: 'asc' }],
            skip,
            take,
          }),
        () =>
          this.prisma.chargeInvoice.findMany({
            where: invoiceWhere,
            orderBy: [{ jalaliYear: 'asc' }, { jalaliMonth: 'asc' }],
          }),
      ),
      paginateQuery(
        pagination.receipts,
        () => this.prisma.receipt.count({ where: receiptWhere }),
        (skip, take) =>
          this.prisma.receipt.findMany({
            where: receiptWhere,
            include: { receiptType: true, lines: true },
            orderBy: { date: 'asc' },
            skip,
            take,
          }),
        () =>
          this.prisma.receipt.findMany({
            where: receiptWhere,
            include: { receiptType: true, lines: true },
            orderBy: { date: 'asc' },
          }),
      ),
    ]);
    const [debitAgg, creditAgg] = await Promise.all([
      this.prisma.chargeInvoice.aggregate({ where: invoiceWhere, _sum: { amount: true } }),
      this.prisma.receipt.aggregate({ where: receiptWhere, _sum: { totalAmount: true } }),
    ]);
    const debit = money(debitAgg._sum.amount || 0);
    const credit = money(creditAgg._sum.totalAmount || 0);
    const remainingAgg = await this.prisma.chargeInvoice.aggregate({ where: invoiceWhere, _sum: { amount: true, paidAmount: true } });
    const remaining = money(remainingAgg._sum.amount || 0) - money(remainingAgg._sum.paidAmount || 0);
    const chargeCredit = await creditOf(this.prisma, id, fiscalYearId);
    return {
      unit: this.map(unit),
      invoices: {
        ...invoices,
        items: invoices.items.map((i) => ({
          ...i,
          amount: money(i.amount),
          paidAmount: money(i.paidAmount),
          remaining: money(i.amount) - money(i.paidAmount),
          monthTitle: `${JALALI_MONTHS[i.jalaliMonth - 1]} ${i.jalaliYear}`,
        })),
      },
      receipts: {
        ...receipts,
        items: receipts.items.map((r) => ({
          ...r,
          totalAmount: money(r.totalAmount),
          lines: r.lines.map((l) => ({ ...l, amount: money(l.amount) })),
        })),
      },
      totals: { debit, credit, balance: debit - credit, remaining, chargeCredit, net: remaining - chargeCredit },
    };
  }

  monthlyChargeOf(unit: {
    customMonthlyCharge: { toString(): string } | null;
    tariff?: { monthlyAmount: { toString(): string } } | null;
  }) {
    if (unit.customMonthlyCharge != null) {
      return money(unit.customMonthlyCharge);
    }
    if (unit.tariff) {
      return money(unit.tariff.monthlyAmount);
    }
    return 0;
  }

  private map(unit: any) {
    return {
      ...unit,
      area: unit.area == null ? null : money(unit.area),
      customMonthlyCharge: unit.customMonthlyCharge == null ? null : money(unit.customMonthlyCharge),
      tariff: unit.tariff
        ? { ...unit.tariff, monthlyAmount: money(unit.tariff.monthlyAmount) }
        : unit.tariff,
      monthlyCharge: this.monthlyChargeOf(unit),
    };
  }
}
