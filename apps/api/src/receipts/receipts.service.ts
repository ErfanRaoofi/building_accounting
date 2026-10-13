import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, PaymentRequestStatus, Prisma, ReceiptKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreateReceiptDto,
  CreateReceiptTypeDto,
  RemoveReceiptPaymentDto,
  UpdateReceiptDto,
  UpdateReceiptPaymentDto,
  UpdateReceiptTypeDto,
} from './dto';
import { ChargesService } from '../charges/charges.service';
import { JALALI_MONTHS, money, normalizeDigits } from '../common/jalali';
import { paginateQuery, pagedResult, pageRows, type Pagination } from '../common/pagination';
import { STAFF_ROLES } from '../common/roles';
import { compareUnitNumber } from '../common/unit-number';
import { ensureUnitReceipt, ensureUnitReceiptsForFiscalYear, nextReceiptNumber } from './unit-receipt';

const RECEIPT_SORTS = ['date_desc', 'date_asc', 'unit', 'amount_desc', 'amount_asc', 'number'] as const;
type ReceiptSort = (typeof RECEIPT_SORTS)[number];

function parseReceiptSort(value?: string): ReceiptSort {
  return RECEIPT_SORTS.includes(value as ReceiptSort) ? (value as ReceiptSort) : 'date_desc';
}

const RECEIPT_PAYMENT_INCLUDE = {
  receiptType: true,
  lines: { include: { chargeInvoice: true } },
  paymentRequest: { select: { id: true } },
  receipt: {
    select: {
      id: true,
      number: true,
      unitId: true,
      unit: { select: { id: true, number: true, ownerName: true, residentName: true } },
    },
  },
} as const;

const RECEIPT_INCLUDE = {
  receiptType: true,
  unit: true,
  createdBy: { select: { id: true, name: true } },
  lines: { include: { chargeInvoice: true } },
  payments: {
    orderBy: { date: 'asc' as const },
    include: {
      receiptType: true,
      lines: { include: { chargeInvoice: true } },
      paymentRequest: { select: { id: true } },
    },
  },
} as const;

@Injectable()
export class ReceiptsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private charges: ChargesService,
  ) {}

  async types(user: AuthUser, buildingId: string, pagination: Pagination) {
    await this.access.assertRoles(user, buildingId, STAFF_ROLES);
    const where = { buildingId };
    return paginateQuery(
      pagination,
      () => this.prisma.receiptType.count({ where }),
      (skip, take) => this.prisma.receiptType.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      () => this.prisma.receiptType.findMany({ where, orderBy: { name: 'asc' } }),
    );
  }

  async createType(user: AuthUser, dto: CreateReceiptTypeDto) {
    await this.access.assertRoles(user, dto.buildingId, STAFF_ROLES);
    return this.prisma.receiptType.create({ data: dto });
  }

  async updateType(user: AuthUser, id: string, dto: UpdateReceiptTypeDto) {
    const type = await this.prisma.receiptType.findUnique({ where: { id } });
    if (!type) {
      throw new NotFoundException('نوع دریافت یافت نشد');
    }
    await this.access.assertRoles(user, type.buildingId, STAFF_ROLES);
    return this.prisma.receiptType.update({
      where: { id },
      data: {
        name: dto.name,
        kind: type.isSystem ? undefined : dto.kind,
      },
    });
  }

  async list(
    user: AuthUser,
    buildingId: string,
    fiscalYearId: string,
    pagination: Pagination,
    filters?: { q?: string; unitQ?: string; sort?: string },
  ) {
    await this.access.assertRoles(user, buildingId, STAFF_ROLES);
    const filtersWhere = [this.unitSearchWhere(filters?.unitQ), this.searchWhere(filters?.q)].filter(
      (part) => Object.keys(part).length > 0,
    );
    const where: Prisma.ReceiptWhereInput = {
      buildingId,
      fiscalYearId,
      ...(filtersWhere.length === 1 ? filtersWhere[0] : filtersWhere.length > 1 ? { AND: filtersWhere } : {}),
    };
    const sort = parseReceiptSort(filters?.sort);
    const [result, totals] = await Promise.all([
      sort === 'unit' ? this.listByUnitNumber(where, pagination) : this.listOrdered(where, pagination, sort),
      this.typeTotals(where),
    ]);
    return { ...result, totals };
  }

  async listPayments(
    user: AuthUser,
    buildingId: string,
    fiscalYearId: string,
    pagination: Pagination,
    filters?: { q?: string; unitQ?: string; sort?: string },
  ) {
    await this.access.assertRoles(user, buildingId, STAFF_ROLES);
    const where = this.paymentListWhere(buildingId, fiscalYearId, filters);
    const sort = parseReceiptSort(filters?.sort);
    const [result, totals] = await Promise.all([
      sort === 'unit' ? this.listPaymentsByUnit(where, pagination) : this.listPaymentsOrdered(where, pagination, sort),
      this.paymentTypeTotals(where),
    ]);
    return { ...result, totals };
  }

  private paymentListWhere(
    buildingId: string,
    fiscalYearId: string,
    filters?: { q?: string; unitQ?: string },
  ): Prisma.ReceiptPaymentWhereInput {
    const receiptFilters = [this.unitSearchWhere(filters?.unitQ)].filter((part) => Object.keys(part).length > 0);
    const receiptWhere: Prisma.ReceiptWhereInput = {
      buildingId,
      fiscalYearId,
      ...(receiptFilters.length === 1
        ? receiptFilters[0]
        : receiptFilters.length > 1
          ? { AND: receiptFilters }
          : {}),
    };
    const search = this.paymentSearchWhere(filters?.q);
    if (!Object.keys(search).length) {
      return { receipt: receiptWhere };
    }
    return { AND: [{ receipt: receiptWhere }, search] };
  }

  private paymentSearchWhere(q?: string): Prisma.ReceiptPaymentWhereInput {
    const term = q?.trim();
    if (!term) {
      return {};
    }
    const mode = 'insensitive' as const;
    const or: Prisma.ReceiptPaymentWhereInput[] = [
      { description: { contains: term, mode } },
      { receiptType: { name: { contains: term, mode } } },
      { receipt: { number: { contains: term, mode } } },
    ];
    const month = JALALI_MONTHS.findIndex((name) => name === term || name.startsWith(term));
    if (month >= 0) {
      or.push({ lines: { some: { chargeInvoice: { jalaliMonth: month + 1 } } } });
    }
    const year = Number(term);
    if (Number.isInteger(year) && year >= 1300 && year <= 1600) {
      or.push({ lines: { some: { chargeInvoice: { jalaliYear: year } } } });
    }
    return { OR: or };
  }

  private async listPaymentsOrdered(
    where: Prisma.ReceiptPaymentWhereInput,
    pagination: Pagination,
    sort: ReceiptSort,
  ) {
    const orderBy = this.paymentOrder(sort);
    const result = await paginateQuery(
      pagination,
      () => this.prisma.receiptPayment.count({ where }),
      (skip, take) =>
        this.prisma.receiptPayment.findMany({
          where,
          include: RECEIPT_PAYMENT_INCLUDE,
          orderBy,
          skip,
          take,
        }),
      () => this.prisma.receiptPayment.findMany({ where, include: RECEIPT_PAYMENT_INCLUDE, orderBy }),
    );
    return { ...result, items: result.items.map((row) => this.mapPayment(row)) };
  }

  private async listPaymentsByUnit(where: Prisma.ReceiptPaymentWhereInput, pagination: Pagination) {
    const heads = await this.prisma.receiptPayment.findMany({
      where,
      select: { id: true, receipt: { select: { unit: { select: { number: true } } } } },
    });
    heads.sort(
      (a, b) => compareUnitNumber(a.receipt.unit?.number, b.receipt.unit?.number) || a.id.localeCompare(b.id),
    );
    const page = pagination.all ? heads : heads.slice(pagination.skip, pagination.skip + pagination.take);
    const rows = page.length
      ? await this.prisma.receiptPayment.findMany({
          where: { id: { in: page.map((row) => row.id) } },
          include: RECEIPT_PAYMENT_INCLUDE,
        })
      : [];
    const order = new Map(page.map((row, index) => [row.id, index]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return pagedResult(
      rows.map((row) => this.mapPayment(row)),
      heads.length,
      pagination.all ? 1 : pagination.page,
      pagination.all ? heads.length || pagination.pageSize : pagination.pageSize,
    );
  }

  private paymentOrder(sort: ReceiptSort): Prisma.ReceiptPaymentOrderByWithRelationInput[] {
    if (sort === 'date_asc') {
      return [{ date: 'asc' }, { createdAt: 'asc' }];
    }
    if (sort === 'amount_desc') {
      return [{ amount: 'desc' }, { date: 'desc' }];
    }
    if (sort === 'amount_asc') {
      return [{ amount: 'asc' }, { date: 'desc' }];
    }
    if (sort === 'number') {
      return [{ receipt: { number: 'asc' } }, { date: 'desc' }];
    }
    return [{ date: 'desc' }, { createdAt: 'desc' }];
  }

  private async paymentTypeTotals(where: Prisma.ReceiptPaymentWhereInput) {
    const grouped = await this.prisma.receiptPayment.groupBy({
      by: ['receiptTypeId'],
      where,
      _sum: { amount: true },
    });
    const types = grouped.length
      ? await this.prisma.receiptType.findMany({ where: { id: { in: grouped.map((row) => row.receiptTypeId) } } })
      : [];
    const byId = new Map(types.map((type) => [type.id, type]));
    const rank = (kind?: ReceiptKind) => (kind === ReceiptKind.CHARGE ? 0 : kind === ReceiptKind.ENTRANCE ? 1 : 2);
    const byType = grouped
      .map((row) => {
        const type = byId.get(row.receiptTypeId);
        return {
          id: row.receiptTypeId,
          name: type?.name || 'سایر',
          kind: type?.kind || ReceiptKind.OTHER,
          amount: money(row._sum.amount || 0),
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name, 'fa'));
    return {
      byType,
      total: byType.reduce((sum, row) => sum + row.amount, 0),
    };
  }

  private mapPayment(row: any) {
    const payLines = row.lines || [];
    const months = this.monthItems({ lines: payLines });
    const prepaid = payLines.some((line: any) => !line.chargeInvoiceId && !line.chargeInvoice);
    const charge = row.receiptType?.kind === 'CHARGE';
    return {
      id: row.id,
      date: row.date,
      amount: money(row.amount),
      paymentMethod: row.paymentMethod,
      description: row.description,
      createdAt: row.createdAt,
      receiptType: row.receiptType || null,
      receipt: row.receipt
        ? {
            id: row.receipt.id,
            number: row.receipt.number,
            unitId: row.receipt.unitId,
            unit: row.receipt.unit || null,
          }
        : null,
      months,
      monthsLabel: charge ? (months.length || prepaid ? this.monthsLabel(months, prepaid) : 'بدون ماه') : null,
      fromRequest: Boolean(row.paymentRequest),
    };
  }

  private async listOrdered(where: Prisma.ReceiptWhereInput, pagination: Pagination, sort: ReceiptSort) {
    const orderBy = this.receiptOrder(sort);
    const result = await paginateQuery(
      pagination,
      () => this.prisma.receipt.count({ where }),
      (skip, take) =>
        this.prisma.receipt.findMany({
          where,
          include: RECEIPT_INCLUDE,
          orderBy,
          skip,
          take,
        }),
      () => this.prisma.receipt.findMany({ where, include: RECEIPT_INCLUDE, orderBy }),
    );
    return { ...result, items: result.items.map((row) => this.map(row)) };
  }

  private async listByUnitNumber(where: Prisma.ReceiptWhereInput, pagination: Pagination) {
    const heads = await this.prisma.receipt.findMany({
      where,
      select: { id: true, unit: { select: { number: true } } },
    });
    heads.sort((a, b) => compareUnitNumber(a.unit?.number, b.unit?.number) || a.id.localeCompare(b.id));
    const page = pagination.all ? heads : heads.slice(pagination.skip, pagination.skip + pagination.take);
    const rows = page.length
      ? await this.prisma.receipt.findMany({
          where: { id: { in: page.map((row) => row.id) } },
          include: RECEIPT_INCLUDE,
        })
      : [];
    const order = new Map(page.map((row, index) => [row.id, index]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return pagedResult(
      rows.map((row) => this.map(row)),
      heads.length,
      pagination.all ? 1 : pagination.page,
      pagination.all ? heads.length || pagination.pageSize : pagination.pageSize,
    );
  }

  private receiptOrder(sort: ReceiptSort): Prisma.ReceiptOrderByWithRelationInput[] {
    if (sort === 'date_asc') {
      return [{ date: 'asc' }, { number: 'asc' }];
    }
    if (sort === 'amount_desc') {
      return [{ totalAmount: 'desc' }, { number: 'desc' }];
    }
    if (sort === 'amount_asc') {
      return [{ totalAmount: 'asc' }, { number: 'asc' }];
    }
    if (sort === 'number') {
      return [{ number: 'asc' }];
    }
    return [{ date: 'desc' }, { number: 'desc' }];
  }

  private async typeTotals(where: Prisma.ReceiptWhereInput) {
    const grouped = await this.prisma.receiptPayment.groupBy({
      by: ['receiptTypeId'],
      where: { receipt: where },
      _sum: { amount: true },
    });
    const types = grouped.length
      ? await this.prisma.receiptType.findMany({ where: { id: { in: grouped.map((row) => row.receiptTypeId) } } })
      : [];
    const byId = new Map(types.map((type) => [type.id, type]));
    const rank = (kind?: ReceiptKind) => (kind === ReceiptKind.CHARGE ? 0 : kind === ReceiptKind.ENTRANCE ? 1 : 2);
    const byType = grouped
      .map((row) => {
        const type = byId.get(row.receiptTypeId);
        return {
          id: row.receiptTypeId,
          name: type?.name || 'سایر',
          kind: type?.kind || ReceiptKind.OTHER,
          amount: money(row._sum.amount || 0),
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name, 'fa'));
    return {
      byType,
      total: byType.reduce((sum, row) => sum + row.amount, 0),
    };
  }

  async find(user: AuthUser, id: string) {
    const row = await this.prisma.receipt.findUnique({ where: { id }, include: RECEIPT_INCLUDE });
    if (!row) {
      throw new NotFoundException('دریافت یافت نشد');
    }
    await this.access.assertRoles(user, row.buildingId, STAFF_ROLES);
    return this.map(row);
  }

  async seedFiscalYearUnitReceipts(user: AuthUser, fiscalYearId: string) {
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!fy) {
      throw new NotFoundException('سال مالی یافت نشد');
    }
    await this.access.assertRoles(user, fy.buildingId, STAFF_ROLES);
    await this.prisma.$transaction((tx) =>
      ensureUnitReceiptsForFiscalYear(tx, {
        buildingId: fy.buildingId,
        fiscalYearId: fy.id,
        title: fy.title,
        createdById: user.id,
      }),
    );
    return { ok: true };
  }

  async seedUnitReceipt(user: AuthUser, unitId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) {
      throw new NotFoundException('واحد یافت نشد');
    }
    await this.access.assertRoles(user, unit.buildingId, STAFF_ROLES);
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { buildingId: unit.buildingId, status: 'OPEN' },
      orderBy: { startDate: 'desc' },
    });
    if (!fy) {
      return null;
    }
    return this.prisma.$transaction((tx) =>
      ensureUnitReceipt(tx, {
        buildingId: unit.buildingId,
        fiscalYearId: fy.id,
        unitId: unit.id,
        createdById: user.id,
        title: fy.title,
      }),
    );
  }

  async create(user: AuthUser, dto: CreateReceiptDto) {
    const fy = await this.access.assertOpenFiscalYear(user, dto.fiscalYearId, STAFF_ROLES);
    if (fy.buildingId !== dto.buildingId) {
      throw new BadRequestException('سال مالی متعلق به این ساختمان نیست');
    }
    const type = await this.prisma.receiptType.findUnique({ where: { id: dto.receiptTypeId } });
    if (!type || type.buildingId !== dto.buildingId) {
      throw new NotFoundException('نوع دریافت یافت نشد');
    }
    if (type.kind === ReceiptKind.CHARGE && !dto.unitId) {
      throw new BadRequestException('برای دریافت شارژ انتخاب واحد الزامی است');
    }
    const totalAmount = dto.lines.reduce((s, l) => s + l.amount, 0);
    if (totalAmount <= 0) {
      throw new BadRequestException('مبلغ دریافت باید بیشتر از صفر باشد');
    }
    if (type.kind === ReceiptKind.CHARGE) {
      await this.validateChargeLines(dto);
    }

    // Unit document: always append into the single per-unit FY receipt
    if (dto.unitId) {
      const result = await this.prisma.$transaction(async (tx) => {
        const shell = await ensureUnitReceipt(tx, {
          buildingId: dto.buildingId,
          fiscalYearId: dto.fiscalYearId,
          unitId: dto.unitId!,
          createdById: user.id,
          title: fy.title,
        });
        return this.appendUnitPayment(tx, shell.id, dto, type, totalAmount);
      });
      return { ...this.map(result.receipt), appended: true, paymentId: result.paymentId };
    }

    // Building-level receipt (no unit) — rare path for non-unit deposits
    const number = await this.prisma.$transaction((tx) =>
      nextReceiptNumber(tx, dto.buildingId, dto.fiscalYearId, fy.title),
    );
    const receipt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.receipt.create({
        data: {
          buildingId: dto.buildingId,
          fiscalYearId: dto.fiscalYearId,
          receiptTypeId: dto.receiptTypeId,
          unitId: null,
          number,
          date: new Date(dto.date),
          totalAmount,
          paymentMethod: dto.paymentMethod,
          description: dto.description,
          createdById: user.id,
          payments: {
            create: {
              receiptTypeId: dto.receiptTypeId,
              date: new Date(dto.date),
              amount: totalAmount,
              paymentMethod: dto.paymentMethod,
              description: dto.description,
            },
          },
        },
      });
      const payment = await tx.receiptPayment.findFirstOrThrow({ where: { receiptId: created.id } });
      if (dto.lines.length) {
        await tx.receiptLine.createMany({
          data: dto.lines.map((l) => ({
            receiptId: created.id,
            paymentId: payment.id,
            chargeInvoiceId: l.chargeInvoiceId,
            amount: l.amount,
            description: l.description,
          })),
        });
      }
      return tx.receipt.findUniqueOrThrow({ where: { id: created.id }, include: RECEIPT_INCLUDE });
    });
    return this.map(receipt);
  }

  async update(user: AuthUser, id: string, dto: UpdateReceiptDto) {
    const existing = await this.prisma.receipt.findUnique({
      where: { id },
      include: { lines: true, receiptType: true },
    });
    if (!existing) {
      throw new NotFoundException('دریافت یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, existing.fiscalYearId, STAFF_ROLES);

    const receiptTypeId = dto.receiptTypeId || existing.receiptTypeId;
    const type = await this.prisma.receiptType.findUnique({ where: { id: receiptTypeId } });
    if (!type || type.buildingId !== existing.buildingId) {
      throw new NotFoundException('نوع دریافت یافت نشد');
    }
    const unitId = dto.unitId === undefined ? existing.unitId : dto.unitId;
    if (type.kind === ReceiptKind.CHARGE && !unitId) {
      throw new BadRequestException('برای دریافت شارژ انتخاب واحد الزامی است');
    }
    const totalAmount = dto.lines.reduce((s, l) => s + l.amount, 0);
    if (totalAmount <= 0) {
      throw new BadRequestException('مبلغ دریافت باید بیشتر از صفر باشد');
    }
    if (type.kind === ReceiptKind.CHARGE) {
      await this.validateChargeLines(
        {
          buildingId: existing.buildingId,
          fiscalYearId: existing.fiscalYearId,
          receiptTypeId,
          unitId: unitId || undefined,
          date: dto.date || existing.date.toISOString(),
          lines: dto.lines,
        },
        id,
      );
    }

    if (existing.unitId) {
      throw new BadRequestException('سند واحد را از روی هر واریزی ویرایش کنید');
    }

    const affectedUnits = new Set<string>();
    if (existing.unitId) {
      affectedUnits.add(existing.unitId);
    }
    if (unitId) {
      affectedUnits.add(unitId);
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      await this.reverseReceiptEffects(tx, existing);
      await tx.receiptLine.deleteMany({ where: { receiptId: id } });
      const holder = await tx.receiptPayment.findFirst({ where: { receiptId: id }, orderBy: { createdAt: 'asc' } });
      const paymentId = holder
        ? holder.id
        : (
            await tx.receiptPayment.create({
              data: {
                receiptId: id,
                receiptTypeId,
                date: dto.date ? new Date(dto.date) : existing.date,
                amount: totalAmount,
                paymentMethod: dto.paymentMethod || existing.paymentMethod,
                description: dto.description,
              },
            })
          ).id;
      await tx.receipt.update({
        where: { id },
        data: {
          receiptTypeId,
          unitId: unitId || null,
          date: dto.date ? new Date(dto.date) : undefined,
          totalAmount,
          paymentMethod: dto.paymentMethod,
          description: dto.description,
        },
      });
      await tx.receiptLine.createMany({
        data: dto.lines.map((l) => ({
          receiptId: id,
          paymentId,
          chargeInvoiceId: l.chargeInvoiceId,
          amount: l.amount,
          description: l.description,
        })),
      });
      await this.matchPayments(tx, id, totalAmount, {
        date: dto.date ? new Date(dto.date) : existing.date,
        paymentMethod: dto.paymentMethod || existing.paymentMethod,
        description: dto.description,
      });
      for (const line of dto.lines) {
        if (!line.chargeInvoiceId) {
          continue;
        }
        const invoice = await tx.chargeInvoice.findUnique({ where: { id: line.chargeInvoiceId } });
        if (!invoice) {
          continue;
        }
        const paidAmount = money(invoice.paidAmount) + line.amount;
        await tx.chargeInvoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount,
            status: this.charges.invoiceStatus(money(invoice.amount), paidAmount),
          },
        });
      }
      for (const uid of affectedUnits) {
        await this.charges.allocateCredit(tx, uid, existing.fiscalYearId);
      }
      return tx.receipt.findUniqueOrThrow({ where: { id }, include: RECEIPT_INCLUDE });
    });
    return this.map(receipt);
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.receipt.findUnique({
      where: { id },
      include: { lines: true, receiptType: true },
    });
    if (!existing) {
      throw new NotFoundException('دریافت یافت نشد');
    }
    if (existing.unitId) {
      throw new ForbiddenException('سند واحد قابل حذف نیست؛ فقط واریزی‌های داخل آن را حذف کنید');
    }
    await this.access.assertOpenFiscalYear(user, existing.fiscalYearId, STAFF_ROLES);
    await this.prisma.$transaction(async (tx) => {
      await this.reverseReceiptEffects(tx, existing);
      await tx.receipt.delete({ where: { id } });
    });
    return { ok: true };
  }

  async updatePayment(user: AuthUser, receiptId: string, paymentId: string, dto: UpdateReceiptPaymentDto) {
    const existing = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        lines: true,
        receiptType: true,
        payments: {
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          include: { receiptType: true },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('دریافت یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, existing.fiscalYearId, STAFF_ROLES);
    const payment = existing.payments.find((row) => row.id === paymentId);
    if (!payment) {
      throw new NotFoundException('واریزی یافت نشد');
    }

    const nextAmount = dto.amount == null ? money(payment.amount) : Math.round(Number(dto.amount));
    if (nextAmount < 1) {
      throw new BadRequestException('مبلغ واریزی باید بیشتر از صفر باشد');
    }
    const isChargePayment = payment.receiptType?.kind === ReceiptKind.CHARGE;
    const replaceLines = isChargePayment && dto.lines != null;
    const lines = replaceLines ? this.linesForChargePayment(dto.lines, nextAmount) : [];
    if (replaceLines) {
      const monthSum = (dto.lines || [])
        .filter((line) => line.chargeInvoiceId)
        .reduce((sum, line) => sum + Math.round(Number(line.amount) || 0), 0);
      if (monthSum > nextAmount) {
        throw new BadRequestException('مبلغ واریزی از جمع ماه‌ها کمتر است');
      }
      if (existing.unitId) {
        await this.assertChargePaymentLines(existing.unitId, existing.fiscalYearId, paymentId, dto.lines || []);
      }
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      await tx.receiptPayment.update({
        where: { id: paymentId },
        data: {
          date: dto.date ? new Date(dto.date) : undefined,
          amount: nextAmount,
          paymentMethod: dto.paymentMethod,
          description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        },
      });
      if (!isChargePayment) {
        await tx.receiptLine.deleteMany({ where: { paymentId } });
      } else if (replaceLines) {
        await tx.receiptLine.deleteMany({ where: { paymentId } });
        if (lines.length) {
          await tx.receiptLine.createMany({
            data: lines.map((line) => ({
              receiptId,
              paymentId,
              chargeInvoiceId: line.chargeInvoiceId,
              amount: line.amount,
              description: line.description,
            })),
          });
        }
      }
      if (existing.unitId && (replaceLines || !isChargePayment)) {
        await this.recomputeUnitInvoices(tx, existing.unitId, existing.fiscalYearId);
      }
      await this.refreshReceiptTotal(tx, receiptId);
      await this.syncReceiptHeaderFromPayments(tx, receiptId);
      return tx.receipt.findUniqueOrThrow({ where: { id: receiptId }, include: RECEIPT_INCLUDE });
    });
    return this.map(receipt);
  }

  async removePayment(user: AuthUser, receiptId: string, paymentId: string, dto?: RemoveReceiptPaymentDto) {
    const existing = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        lines: true,
        receiptType: true,
        payments: { include: { receiptType: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('دریافت یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, existing.fiscalYearId, STAFF_ROLES);
    const payment = existing.payments.find((row) => row.id === paymentId);
    if (!payment) {
      throw new NotFoundException('واریزی یافت نشد');
    }
    const linked = await this.prisma.paymentRequest.findUnique({ where: { receiptPaymentId: paymentId } });
    const reason = dto?.reason?.trim() || '';
    if (linked && reason.length < 3) {
      throw new BadRequestException('برای حذف واریزیِ درخواست ساکن، دلیل حذف را بنویسید');
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      if (linked) {
        await tx.paymentRequest.update({
          where: { id: linked.id },
          data: {
            status: PaymentRequestStatus.VOIDED,
            voidReason: reason,
            receiptPaymentId: null,
            reviewedById: user.id,
            reviewedAt: new Date(),
          },
        });
      }
      await tx.receiptPayment.delete({ where: { id: paymentId } });
      if (existing.unitId) {
        await this.recomputeUnitInvoices(tx, existing.unitId, existing.fiscalYearId);
      }
      await this.refreshReceiptTotal(tx, receiptId);
      await this.syncReceiptHeaderFromPayments(tx, receiptId);
      return tx.receipt.findUniqueOrThrow({ where: { id: receiptId }, include: RECEIPT_INCLUDE });
    });
    return { ...this.map(receipt), receiptDeleted: false };
  }

  private async assertChargePaymentLines(
    unitId: string,
    fiscalYearId: string,
    paymentId: string,
    lines: { chargeInvoiceId?: string; amount: number }[],
  ) {
    const invoices = await this.prisma.chargeInvoice.findMany({ where: { unitId, fiscalYearId } });
    const own = await this.prisma.receiptLine.findMany({
      where: { paymentId, chargeInvoiceId: { not: null } },
    });
    const ownByInvoice = new Map<string, number>();
    for (const line of own) {
      if (!line.chargeInvoiceId) {
        continue;
      }
      ownByInvoice.set(line.chargeInvoiceId, (ownByInvoice.get(line.chargeInvoiceId) || 0) + money(line.amount));
    }
    for (const line of lines) {
      if (!line.chargeInvoiceId || line.amount <= 0) {
        continue;
      }
      const invoice = invoices.find((row) => row.id === line.chargeInvoiceId);
      if (!invoice) {
        throw new BadRequestException('ماه شارژ متعلق به این واحد نیست');
      }
      const cap = money(invoice.amount) - money(invoice.paidAmount) + (ownByInvoice.get(invoice.id) || 0);
      if (Math.round(line.amount) > cap) {
        throw new BadRequestException('مبلغ ماه از مانده شارژ بیشتر است');
      }
    }
  }

  private linesForChargePayment(
    lines: { chargeInvoiceId?: string; amount: number; description?: string }[] | undefined,
    amount: number,
  ) {
    const picked = (lines || [])
      .map((line) => ({ ...line, amount: Math.round(Number(line.amount) || 0) }))
      .filter((line) => line.amount > 0);
    const monthSum = picked.reduce((sum, line) => sum + line.amount, 0);
    if (amount > monthSum) {
      picked.push({ amount: amount - monthSum, description: 'پیش‌پرداخت / بستانکار' });
    }
    return picked;
  }

  private async recomputeUnitInvoices(tx: Prisma.TransactionClient, unitId: string, fiscalYearId: string) {
    const invoices = await tx.chargeInvoice.findMany({ where: { unitId, fiscalYearId } });
    for (const invoice of invoices) {
      const sum = await tx.receiptLine.aggregate({
        where: { chargeInvoiceId: invoice.id, payment: { receiptType: { kind: ReceiptKind.CHARGE } } },
        _sum: { amount: true },
      });
      const paidAmount = money(sum._sum.amount || 0);
      await tx.chargeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          status: this.charges.invoiceStatus(money(invoice.amount), paidAmount),
        },
      });
    }
  }

  private async appendUnitPayment(
    tx: Prisma.TransactionClient,
    receiptId: string,
    dto: CreateReceiptDto,
    type: { id: string; kind: ReceiptKind; name: string },
    totalAmount: number,
  ) {
    const current = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId } });

    const payment = await tx.receiptPayment.create({
      data: {
        receiptId,
        receiptTypeId: type.id,
        date: new Date(dto.date),
        amount: totalAmount,
        paymentMethod: dto.paymentMethod,
        description: dto.description,
      },
    });

    if (type.kind === ReceiptKind.CHARGE) {
      await tx.receiptLine.createMany({
        data: dto.lines.map((line) => ({
          receiptId,
          paymentId: payment.id,
          chargeInvoiceId: line.chargeInvoiceId,
          amount: line.amount,
          description: line.description,
        })),
      });
      if (dto.unitId) {
        await this.recomputeUnitInvoices(tx, dto.unitId, dto.fiscalYearId);
      }
    }

    await tx.receipt.update({
      where: { id: receiptId },
      data: {
        totalAmount: money(current.totalAmount) + totalAmount,
        date: new Date(dto.date),
        paymentMethod: dto.paymentMethod,
      },
    });
    const receipt = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId }, include: RECEIPT_INCLUDE });
    return { receipt, paymentId: payment.id };
  }

  private async refreshReceiptTotal(tx: Prisma.TransactionClient, receiptId: string) {
    const payments = await tx.receiptPayment.findMany({ where: { receiptId } });
    const total = payments.reduce((sum, row) => sum + money(row.amount), 0);
    await tx.receipt.update({ where: { id: receiptId }, data: { totalAmount: total } });
  }

  private async syncReceiptHeaderFromPayments(tx: Prisma.TransactionClient, receiptId: string) {
    const latest = await tx.receiptPayment.findFirst({
      where: { receiptId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    if (!latest) {
      return;
    }
    await tx.receipt.update({
      where: { id: receiptId },
      data: {
        date: latest.date,
        paymentMethod: latest.paymentMethod,
      },
    });
  }

  private async applyLineEffects(tx: Prisma.TransactionClient, receiptId: string) {
    const lines = await tx.receiptLine.findMany({ where: { receiptId } });
    for (const line of lines) {
      if (!line.chargeInvoiceId) {
        continue;
      }
      const invoice = await tx.chargeInvoice.findUnique({ where: { id: line.chargeInvoiceId } });
      if (!invoice) {
        continue;
      }
      const paidAmount = money(invoice.paidAmount) + money(line.amount);
      await tx.chargeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          status: this.charges.invoiceStatus(money(invoice.amount), paidAmount),
        },
      });
    }
  }

  private async matchPayments(
    tx: Prisma.TransactionClient,
    receiptId: string,
    total: number,
    fallback: { date: Date; paymentMethod?: PaymentMethod; description?: string },
  ) {
    const payments = await tx.receiptPayment.findMany({
      where: { receiptId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    if (!payments.length) {
      if (total <= 0) {
        return;
      }
      const receipt = await tx.receipt.findUniqueOrThrow({
        where: { id: receiptId },
        select: { receiptTypeId: true },
      });
      await tx.receiptPayment.create({
        data: {
          receiptId,
          receiptTypeId: receipt.receiptTypeId,
          date: fallback.date,
          amount: total,
          paymentMethod: fallback.paymentMethod || PaymentMethod.CASH,
          description: fallback.description,
        },
      });
      return;
    }
    if (payments.length === 1) {
      await tx.receiptPayment.update({
        where: { id: payments[0].id },
        data: {
          amount: total,
          date: fallback.date,
          paymentMethod: fallback.paymentMethod || PaymentMethod.CASH,
          description: fallback.description,
        },
      });
      return;
    }
    let gap = total - payments.reduce((sum, payment) => sum + money(payment.amount), 0);
    for (let index = payments.length - 1; index >= 0 && gap !== 0; index -= 1) {
      const payment = payments[index];
      const next = money(payment.amount) + gap;
      if (next > 0) {
        await tx.receiptPayment.update({ where: { id: payment.id }, data: { amount: next } });
        gap = 0;
      } else {
        await tx.receiptPayment.delete({ where: { id: payment.id } });
        gap = next;
      }
    }
  }

  private async reverseReceiptEffects(
    tx: Prisma.TransactionClient,
    receipt: { lines: { chargeInvoiceId: string | null; amount: Prisma.Decimal | number }[] },
  ) {
    for (const line of receipt.lines) {
      if (!line.chargeInvoiceId) {
        continue;
      }
      const invoice = await tx.chargeInvoice.findUnique({ where: { id: line.chargeInvoiceId } });
      if (!invoice) {
        continue;
      }
      const paidAmount = Math.max(0, money(invoice.paidAmount) - money(line.amount));
      await tx.chargeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          status: this.charges.invoiceStatus(money(invoice.amount), paidAmount),
        },
      });
    }
  }

  private async validateChargeLines(dto: CreateReceiptDto, excludeReceiptId?: string) {
    const billed = dto.lines.filter((line) => line.chargeInvoiceId);
    if (!billed.length) {
      return;
    }
    for (const line of billed) {
      const invoice = await this.prisma.chargeInvoice.findUnique({ where: { id: line.chargeInvoiceId } });
      if (!invoice) {
        throw new NotFoundException('فاکتور شارژ یافت نشد');
      }
      if (invoice.unitId !== dto.unitId) {
        throw new BadRequestException('فاکتور متعلق به این واحد نیست');
      }
      let remaining = money(invoice.amount) - money(invoice.paidAmount);
      if (excludeReceiptId) {
        const prev = await this.prisma.receiptLine.aggregate({
          where: { receiptId: excludeReceiptId, chargeInvoiceId: line.chargeInvoiceId },
          _sum: { amount: true },
        });
        remaining += money(prev._sum.amount || 0);
      }
      if (line.amount > remaining) {
        throw new BadRequestException('مبلغ از مانده بدهی ماه بیشتر است');
      }
    }
  }

  private unitSearchWhere(unitQ?: string): Prisma.ReceiptWhereInput {
    const raw = unitQ?.trim();
    if (!raw) {
      return {};
    }
    const terms = [...new Set([raw, normalizeDigits(raw)].map((t) => t.trim()).filter(Boolean))];
    const mode = 'insensitive' as const;
    return {
      OR: terms.flatMap((term) => [
        { unit: { number: { contains: term, mode } } },
        { unit: { ownerName: { contains: term, mode } } },
        { unit: { residentName: { contains: term, mode } } },
      ]),
    };
  }

  private searchWhere(q?: string): Prisma.ReceiptWhereInput {
    const term = q?.trim();
    if (!term) {
      return {};
    }
    const mode = 'insensitive' as const;
    const or: Prisma.ReceiptWhereInput[] = [
      { number: { contains: term, mode } },
      { description: { contains: term, mode } },
      { receiptType: { name: { contains: term, mode } } },
    ];
    const month = JALALI_MONTHS.findIndex((name) => name === term || name.startsWith(term));
    if (month >= 0) {
      or.push({ lines: { some: { chargeInvoice: { jalaliMonth: month + 1 } } } });
    }
    const year = Number(term);
    if (Number.isInteger(year) && year >= 1300 && year <= 1600) {
      or.push({ lines: { some: { chargeInvoice: { jalaliYear: year } } } });
    }
    return { OR: or };
  }

  private monthItems(row: any) {
    return (row.lines || [])
      .filter((line: any) => line.chargeInvoice)
      .map((line: any) => ({
        amount: money(line.amount),
        year: line.chargeInvoice.jalaliYear,
        month: line.chargeInvoice.jalaliMonth,
        title: `${JALALI_MONTHS[line.chargeInvoice.jalaliMonth - 1]} ${line.chargeInvoice.jalaliYear}`,
      }))
      .sort((a: { year: number; month: number }, b: { year: number; month: number }) => a.year - b.year || a.month - b.month);
  }

  private monthsLabel(items: { year: number; month: number; title: string }[], prepaid: boolean) {
    if (!items.length) {
      return 'پیش‌پرداخت';
    }
    const count = items.length.toLocaleString('fa-IR');
    let label = `${count} ماهه · ${items[0].title}`;
    if (items.length === 1) {
      return prepaid ? `${label} + پیش‌پرداخت` : label;
    }
    const keys = items.map((item) => item.year * 12 + item.month);
    const consecutive = keys.every((key, index) => index === 0 || key === keys[index - 1] + 1);
    if (consecutive) {
      const sameYear = items[0].year === items[items.length - 1].year;
      const from = JALALI_MONTHS[items[0].month - 1];
      const to = JALALI_MONTHS[items[items.length - 1].month - 1];
      if (sameYear) {
        label = `${count} ماهه · ${from} تا ${to} ${items[0].year}`;
      } else {
        label = `${count} ماهه · ${items[0].title} تا ${items[items.length - 1].title}`;
      }
    } else {
      label = `${count} ماهه · ${items.map((item) => item.title).join('، ')}`;
    }
    return prepaid ? `${label} + پیش‌پرداخت` : label;
  }

  private map(row: any) {
    const months = this.monthItems(row);
    const prepaid = (row.lines || []).some((line: any) => !line.chargeInvoiceId && !line.chargeInvoice);
    const totalAmount = money(row.totalAmount);
    return {
      ...row,
      totalAmount,
      months,
      monthCount: months.length,
      monthsLabel:
        !months.length && !prepaid && totalAmount === 0 ? 'بدون واریزی' : this.monthsLabel(months, prepaid),
      payments: (row.payments || []).map((payment: any) => {
        const payLines = payment.lines || [];
        const months = this.monthItems({ lines: payLines });
        const prepaid = payLines.some((line: any) => !line.chargeInvoiceId && !line.chargeInvoice);
        const charge = payment.receiptType?.kind === 'CHARGE';
        return {
          ...payment,
          amount: money(payment.amount),
          receiptType: payment.receiptType || null,
          lines: payLines.map((line: any) => ({
            ...line,
            amount: money(line.amount),
            chargeInvoice: line.chargeInvoice
              ? {
                  ...line.chargeInvoice,
                  amount: money(line.chargeInvoice.amount),
                  paidAmount: money(line.chargeInvoice.paidAmount),
                }
              : null,
          })),
          months,
          monthsLabel: charge ? (months.length || prepaid ? this.monthsLabel(months, prepaid) : 'بدون ماه') : null,
          fromRequest: Boolean(payment.paymentRequest),
        };
      }),
      lines: row.lines?.map((l: any) => ({
        ...l,
        amount: money(l.amount),
        chargeInvoice: l.chargeInvoice
          ? {
              ...l.chargeInvoice,
              amount: money(l.chargeInvoice.amount),
              paidAmount: money(l.chargeInvoice.paidAmount),
            }
          : null,
      })),
    };
  }
}
