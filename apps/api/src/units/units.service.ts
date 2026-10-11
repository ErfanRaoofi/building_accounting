import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OccupancyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateUnitDto, UpdateUnitDto } from './dto';
import { JALALI_MONTHS, money, toJalali } from '../common/jalali';
import { sortByUnitNumber } from '../common/unit-number';
import { pageRows, paginateQuery, type Pagination } from '../common/pagination';
import { creditOf } from '../charges/charge-credit';
import { applyUnitOccupancy } from '../charges/charge-occupancy';
import { DEFAULT_VACANT_MONTHLY_CHARGE, monthlyChargeFor, occupiedMonthlyCharge } from '../charges/charge-rate';
import { RESIDENT_ROLES, STAFF_ROLES } from '../common/roles';
import { ensureUnitReceipt } from '../receipts/unit-receipt';

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
    const [rows, vacantRate] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: { tariff: true },
      }),
      this.vacantRateOf(buildingId),
    ]);
    const mapped = sortByUnitNumber(rows, (u) => u.number).map((u) => this.map(u, vacantRate));
    return pageRows(mapped, pagination);
  }

  async create(user: AuthUser, dto: CreateUnitDto) {
    await this.access.assertRoles(user, dto.buildingId, STAFF_ROLES);
    const row = await this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({
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
      const fy = await tx.fiscalYear.findFirst({
        where: { buildingId: dto.buildingId, status: 'OPEN' },
        orderBy: { startDate: 'desc' },
      });
      if (fy) {
        await ensureUnitReceipt(tx, {
          buildingId: dto.buildingId,
          fiscalYearId: fy.id,
          unitId: unit.id,
          createdById: user.id,
          title: fy.title,
        });
      }
      return unit;
    });
    return this.map(row, await this.vacantRateOf(dto.buildingId));
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
    if (dto.occupancy && dto.occupancy !== unit.occupancy) {
      await this.applyCurrentOccupancy(row);
    }
    return this.map(row, await this.vacantRateOf(unit.buildingId));
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
            include: { receiptType: true, lines: true, payments: { orderBy: { date: 'asc' } } },
            orderBy: { date: 'asc' },
            skip,
            take,
          }),
        () =>
          this.prisma.receipt.findMany({
            where: receiptWhere,
            include: { receiptType: true, lines: true, payments: { orderBy: { date: 'asc' } } },
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
      unit: this.map(unit, await this.vacantRateOf(unit.buildingId)),
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
          payments: (r.payments || []).map((payment) => ({ ...payment, amount: money(payment.amount) })),
        })),
      },
      totals: { debit, credit, balance: debit - credit, remaining, chargeCredit, net: remaining - chargeCredit },
    };
  }

  monthlyChargeOf(unit: {
    customMonthlyCharge: { toString(): string } | null;
    tariff?: { monthlyAmount: { toString(): string } } | null;
  }) {
    return occupiedMonthlyCharge(unit);
  }

  private async vacantRateOf(buildingId: string) {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { vacantMonthlyCharge: true },
    });
    return money(building?.vacantMonthlyCharge ?? DEFAULT_VACANT_MONTHLY_CHARGE);
  }

  private async applyCurrentOccupancy(unit: {
    id: string;
    buildingId: string;
    occupancy: OccupancyStatus;
    customMonthlyCharge: { toString(): string } | null;
    tariff: { monthlyAmount: { toString(): string } } | null;
  }) {
    const [years, vacantRate] = await Promise.all([
      this.prisma.fiscalYear.findMany({ where: { buildingId: unit.buildingId, status: 'OPEN' }, select: { id: true } }),
      this.vacantRateOf(unit.buildingId),
    ]);
    const today = toJalali(new Date());
    await this.prisma.$transaction((tx) =>
      applyUnitOccupancy(tx, unit, unit.occupancy, today.jy, today.jm, years.map((year) => year.id), vacantRate, true),
    );
  }

  private map(unit: any, vacantRate: number) {
    return {
      ...unit,
      area: unit.area == null ? null : money(unit.area),
      customMonthlyCharge: unit.customMonthlyCharge == null ? null : money(unit.customMonthlyCharge),
      tariff: unit.tariff
        ? { ...unit.tariff, monthlyAmount: money(unit.tariff.monthlyAmount) }
        : unit.tariff,
      monthlyCharge: monthlyChargeFor(unit, unit.occupancy, vacantRate),
      occupiedCharge: occupiedMonthlyCharge(unit),
    };
  }
}
