import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReceiptKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { JALALI_MONTHS, money, monthsBetween, toJalali } from '../common/jalali';
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

  async unitCharges(user: AuthUser, fiscalYearId: string, pagination: Pagination, query: Record<string, string> = {}) {
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
    const [invoices, creditMap] = await Promise.all([
      this.prisma.chargeInvoice.findMany({
        where: { fiscalYearId },
      }),
      creditsByUnit(this.prisma, fiscalYearId),
    ]);
    const allRows = units.map((unit) => {
      const cells = range.months.map((m) => {
        const inv = invoices.find(
          (i) => i.unitId === unit.id && i.jalaliYear === m.year && i.jalaliMonth === m.month,
        );
        if (!inv) {
          return { year: m.year, month: m.month, title: m.title, status: 'NONE', occupancy: null, remaining: 0, amount: 0 };
        }
        return {
          year: m.year,
          month: m.month,
          title: m.title,
          status: inv.status,
          occupancy: inv.occupancy,
          amount: money(inv.amount),
          paidAmount: money(inv.paidAmount),
          remaining: money(inv.amount) - money(inv.paidAmount),
        };
      });
      const unpaidCount = cells.filter((c) => c.status === 'UNPAID' || c.status === 'PARTIAL').length;
      const paidCount = cells.filter((c) => c.status === 'PAID').length;
      const invoiceRemaining = cells.reduce((s, c) => s + (c.remaining || 0), 0);
      const credit = creditMap.get(unit.id) || 0;
      const wholeYear = range.months.length === months.length;
      const net = wholeYear ? invoiceRemaining - credit : invoiceRemaining;
      return {
        unitId: unit.id,
        number: unit.number,
        ownerName: unit.ownerName,
        residentName: unit.residentName,
        occupancy: unit.occupancy,
        unpaidCount,
        paidCount,
        remaining: net,
        invoiceRemaining,
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
      range,
      rows: paged.items,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
      summary: {
        units: allRows.length,
        fullyPaid: allRows.filter((r) => r.unpaidCount === 0 && r.paidCount > 0).length,
        withDebt: allRows.filter((r) => r.invoiceRemaining > 0).length,
        remaining: allRows.reduce((s, r) => s + Math.max(r.net, 0), 0),
        credit: allRows.reduce((s, r) => s + r.credit, 0),
      },
    };
  }

  async balance(user: AuthUser, buildingId: string, fiscalYearId: string) {
    if (!buildingId || !fiscalYearId) {
      throw new BadRequestException('buildingId و fiscalYearId الزامی است');
    }
    await this.access.assertRoles(user, buildingId, REPORT_ROLES);
    const fy = await this.prisma.fiscalYear.findUnique({
      where: { id: fiscalYearId },
      include: { building: true },
    });
    if (!fy || fy.buildingId !== buildingId) {
      throw new BadRequestException('سال مالی متعلق به این ساختمان نیست');
    }

    const [receiptGroups, paymentGroups, receiptRows, paymentRows] = await Promise.all([
      this.prisma.receiptPayment.groupBy({
        by: ['receiptTypeId'],
        where: { receipt: { buildingId, fiscalYearId } },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['categoryId'],
        where: { buildingId, fiscalYearId },
        _sum: { amount: true },
      }),
      this.prisma.receiptPayment.findMany({
        where: { receipt: { buildingId, fiscalYearId } },
        select: { amount: true, date: true },
      }),
      this.prisma.payment.findMany({
        where: { buildingId, fiscalYearId },
        select: { amount: true, date: true },
      }),
    ]);

    const receiptTypes = receiptGroups.length
      ? await this.prisma.receiptType.findMany({ where: { id: { in: receiptGroups.map((row) => row.receiptTypeId) } } })
      : [];
    const categories = paymentGroups.length
      ? await this.prisma.expenseCategory.findMany({
          where: { id: { in: paymentGroups.map((row) => row.categoryId) } },
          include: { parent: true },
        })
      : [];
    const receiptTypeById = new Map(receiptTypes.map((type) => [type.id, type]));
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const receiptRank = (kind?: ReceiptKind) => (kind === ReceiptKind.CHARGE ? 0 : kind === ReceiptKind.ENTRANCE ? 1 : 2);

    const receiptsByType = receiptGroups
      .map((row) => {
        const type = receiptTypeById.get(row.receiptTypeId);
        return {
          id: row.receiptTypeId,
          name: type?.name || 'سایر',
          kind: type?.kind || ReceiptKind.OTHER,
          amount: money(row._sum.amount || 0),
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => receiptRank(a.kind) - receiptRank(b.kind) || a.name.localeCompare(b.name, 'fa'));

    const paymentsByCategory = paymentGroups
      .map((row) => {
        const category = categoryById.get(row.categoryId);
        const name = category?.parent ? `${category.parent.name} / ${category.name}` : category?.name || 'سایر';
        return {
          id: row.categoryId,
          name,
          amount: money(row._sum.amount || 0),
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));

    const receiptsTotal = receiptsByType.reduce((sum, row) => sum + row.amount, 0);
    const paymentsTotal = paymentsByCategory.reduce((sum, row) => sum + row.amount, 0);

    const months = monthsBetween(fy.startDate, fy.endDate);
    const receiptMonth = new Map<string, number>();
    for (const row of receiptRows) {
      const j = toJalali(row.date);
      const key = `${j.jy}-${j.jm}`;
      receiptMonth.set(key, (receiptMonth.get(key) || 0) + money(row.amount));
    }
    const paymentMonth = new Map<string, number>();
    for (const row of paymentRows) {
      const j = toJalali(row.date);
      const key = `${j.jy}-${j.jm}`;
      paymentMonth.set(key, (paymentMonth.get(key) || 0) + money(row.amount));
    }

    let cumulative = 0;
    const monthly = months.map((month) => {
      const key = `${month.year}-${month.month}`;
      const receipts = receiptMonth.get(key) || 0;
      const payments = paymentMonth.get(key) || 0;
      const balance = receipts - payments;
      cumulative += balance;
      return {
        year: month.year,
        month: month.month,
        title: month.title,
        receipts,
        payments,
        balance,
        cumulative,
      };
    });

    return {
      building: fy.building,
      fiscalYear: fy,
      receiptsTotal,
      paymentsTotal,
      balance: receiptsTotal - paymentsTotal,
      receiptsByType,
      paymentsByCategory,
      months: monthly,
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
        depositAmount: money(p.depositAmount),
        balance: p.balance == null ? null : money(p.balance),
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

  const today = toJalali(new Date());
  const current = clipToAvailable(months, today.jy, today.jm, last);
  let from = parsedFrom ? clipToAvailable(months, parsedFrom.year, parsedFrom.month, first) : first;
  let to = parsedTo ? clipToAvailable(months, parsedTo.year, parsedTo.month, current) : current;
  if (monthIndex(from.year, from.month) > monthIndex(to.year, to.month)) {
    [from, to] = [to, from];
  }
  const fromIndex = monthIndex(from.year, from.month);
  const toIndex = monthIndex(to.year, to.month);
  return {
    from,
    to,
    months: months.filter((month) => {
      const index = monthIndex(month.year, month.month);
      return index >= fromIndex && index <= toIndex;
    }),
  };
}
