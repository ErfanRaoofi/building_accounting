import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { JALALI_MONTHS, money, monthsBetween } from '../common/jalali';
import { sortByUnitNumber } from '../common/unit-number';
import { pageRows, paginateQuery, type Pagination } from '../common/pagination';
import { creditsByUnit, settleFiscalYearCredits } from '../charges/charge-credit';
import { REPORT_ROLES } from '../common/roles';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async unitCharges(user: AuthUser, fiscalYearId: string, pagination: Pagination) {
    const fy = await this.prisma.fiscalYear.findUnique({
      where: { id: fiscalYearId },
      include: { building: true },
    });
    if (!fy) {
      throw new NotFoundException('سال مالی یافت نشد');
    }
    await this.access.assertRoles(user, fy.buildingId, REPORT_ROLES);
    await this.prisma.$transaction((tx) => settleFiscalYearCredits(tx, fiscalYearId));
    const months = monthsBetween(fy.startDate, fy.endDate);
    const units = sortByUnitNumber(
      await this.prisma.unit.findMany({
        where: { buildingId: fy.buildingId, isActive: true },
      }),
      (unit) => unit.number,
    );
    const [invoices, creditMap] = await Promise.all([
      this.prisma.chargeInvoice.findMany({
        where: { fiscalYearId },
      }),
      creditsByUnit(this.prisma, fiscalYearId),
    ]);
    const allRows = units.map((unit) => {
      const cells = months.map((m) => {
        const inv = invoices.find(
          (i) => i.unitId === unit.id && i.jalaliYear === m.year && i.jalaliMonth === m.month,
        );
        if (!inv) {
          return { year: m.year, month: m.month, title: m.title, status: 'NONE', remaining: 0, amount: 0 };
        }
        return {
          year: m.year,
          month: m.month,
          title: m.title,
          status: inv.status,
          amount: money(inv.amount),
          paidAmount: money(inv.paidAmount),
          remaining: money(inv.amount) - money(inv.paidAmount),
        };
      });
      const unpaidCount = cells.filter((c) => c.status === 'UNPAID' || c.status === 'PARTIAL').length;
      const paidCount = cells.filter((c) => c.status === 'PAID').length;
      const remaining = cells.reduce((s, c) => s + (c.remaining || 0), 0);
      const credit = creditMap.get(unit.id) || 0;
      const net = remaining - credit;
      return {
        unitId: unit.id,
        number: unit.number,
        ownerName: unit.ownerName,
        residentName: unit.residentName,
        occupancy: unit.occupancy,
        unpaidCount,
        paidCount,
        remaining: net,
        invoiceRemaining: remaining,
        credit,
        net,
        cells,
      };
    });
    const paged = pageRows(allRows, pagination);
    return {
      building: fy.building,
      fiscalYear: fy,
      months,
      rows: paged.items,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
      summary: {
        units: allRows.length,
        fullyPaid: allRows.filter((r) => r.unpaidCount === 0 && r.paidCount > 0).length,
        withDebt: allRows.filter((r) => r.net > 0).length,
        remaining: allRows.reduce((s, r) => s + Math.max(r.net, 0), 0),
        credit: allRows.reduce((s, r) => s + r.credit, 0),
      },
    };
  }

  async payments(
    user: AuthUser,
    buildingId: string,
    fiscalYearId: string,
    pagination: Pagination,
    from?: string,
    to?: string,
    categoryId?: string,
  ) {
    await this.access.assertRoles(user, buildingId, REPORT_ROLES);
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    const where = {
      buildingId,
      fiscalYearId,
      ...(categoryId ? { categoryId } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };
    const [paged, sum] = await Promise.all([
      paginateQuery(
        pagination,
        () => this.prisma.payment.count({ where }),
        (skip, take) =>
          this.prisma.payment.findMany({
            where,
            include: { category: { include: { parent: true } } },
            orderBy: { date: 'asc' },
            skip,
            take,
          }),
        () =>
          this.prisma.payment.findMany({
            where,
            include: { category: { include: { parent: true } } },
            orderBy: { date: 'asc' },
          }),
      ),
      this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      fiscalYear: fy,
      items: paged.items.map((p) => ({
        ...p,
        amount: money(p.amount),
        categoryPath: p.category.parent ? `${p.category.parent.name} / ${p.category.name}` : p.category.name,
      })),
      total: money(sum._sum.amount || 0),
      count: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  }

  async debtors(user: AuthUser, fiscalYearId: string, pagination: Pagination, query: Record<string, string> = {}) {
    const fy = await this.prisma.fiscalYear.findUnique({
      where: { id: fiscalYearId },
      include: { building: true },
    });
    if (!fy) {
      throw new NotFoundException('سال مالی یافت نشد');
    }
    await this.access.assertRoles(user, fy.buildingId, REPORT_ROLES);
    await this.prisma.$transaction((tx) => settleFiscalYearCredits(tx, fiscalYearId));
    const months = monthsBetween(fy.startDate, fy.endDate);
    const range = clipMonthRange(months, query);
    const units = sortByUnitNumber(
      await this.prisma.unit.findMany({
        where: { buildingId: fy.buildingId, isActive: true },
      }),
      (unit) => unit.number,
    );
    const invoices = await this.prisma.chargeInvoice.findMany({
      where: { fiscalYearId, status: { in: ['UNPAID', 'PARTIAL'] } },
    });
    const allRows = units
      .map((unit) => {
        const unpaidMonths = range.months
          .map((m) => {
            const inv = invoices.find(
              (i) => i.unitId === unit.id && i.jalaliYear === m.year && i.jalaliMonth === m.month,
            );
            if (!inv) {
              return null;
            }
            const remaining = money(inv.amount) - money(inv.paidAmount);
            if (remaining <= 0) {
              return null;
            }
            return {
              year: m.year,
              month: m.month,
              title: m.title,
              status: inv.status,
              amount: money(inv.amount),
              paidAmount: money(inv.paidAmount),
              remaining,
            };
          })
          .filter((cell): cell is NonNullable<typeof cell> => cell != null);
        const remaining = unpaidMonths.reduce((sum, cell) => sum + cell.remaining, 0);
        return {
          unitId: unit.id,
          number: unit.number,
          ownerName: unit.ownerName,
          residentName: unit.residentName,
          phone: unit.phone,
          occupancy: unit.occupancy,
          unpaidMonths,
          unpaidCount: unpaidMonths.length,
          remaining,
        };
      })
      .filter((row) => row.remaining > 0);
    const paged = pageRows(allRows, pagination);
    return {
      building: fy.building,
      fiscalYear: fy,
      months,
      range,
      items: paged.items,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
      summary: {
        units: allRows.length,
        remaining: allRows.reduce((sum, row) => sum + row.remaining, 0),
        unpaidMonths: allRows.reduce((sum, row) => sum + row.unpaidCount, 0),
      },
    };
  }

  monthName(month: number) {
    return JALALI_MONTHS[month - 1];
  }
}

type JalaliMonth = { year: number; month: number; title: string };

function monthIndex(year: number, month: number) {
  return year * 12 + month;
}

function parseMonthParam(query: Record<string, string>, prefix: 'from' | 'to') {
  const year = Number(query[`${prefix}Year`]);
  const month = Number(query[`${prefix}Month`]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function clipToAvailable(months: JalaliMonth[], year: number, month: number, fallback: JalaliMonth) {
  const exact = months.find((m) => m.year === year && m.month === month);
  if (exact) {
    return exact;
  }
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) {
    return fallback;
  }
  const index = monthIndex(year, month);
  if (index <= monthIndex(first.year, first.month)) {
    return first;
  }
  if (index >= monthIndex(last.year, last.month)) {
    return last;
  }
  return fallback;
}

function clipMonthRange(months: JalaliMonth[], query: Record<string, string>) {
  const first = months[0];
  const last = months[months.length - 1] ?? first;
  if (!first || !last) {
    return { from: first, to: last, months };
  }
  const parsedFrom = parseMonthParam(query, 'from');
  const parsedTo = parseMonthParam(query, 'to');
  let from = parsedFrom ? clipToAvailable(months, parsedFrom.year, parsedFrom.month, first) : first;
  let to = parsedTo ? clipToAvailable(months, parsedTo.year, parsedTo.month, last) : last;
  if (monthIndex(from.year, from.month) > monthIndex(to.year, to.month)) {
    [from, to] = [to, from];
  }
  const fromIndex = monthIndex(from.year, from.month);
  const toIndex = monthIndex(to.year, to.month);
  return {
    from,
    to,
    months: months.filter((m) => {
      const index = monthIndex(m.year, m.month);
      return index >= fromIndex && index <= toIndex;
    }),
  };
}
