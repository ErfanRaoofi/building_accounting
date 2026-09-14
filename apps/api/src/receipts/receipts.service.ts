import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReceiptKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateReceiptDto, CreateReceiptTypeDto, UpdateReceiptTypeDto } from './dto';
import { ChargesService } from '../charges/charges.service';
import { JALALI_MONTHS, money } from '../common/jalali';
import { paginateQuery, type Pagination } from '../common/pagination';
import { STAFF_ROLES } from '../common/roles';

const RECEIPT_INCLUDE = {
  receiptType: true,
  unit: true,
  createdBy: { select: { id: true, name: true } },
  lines: { include: { chargeInvoice: true } },
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

  async list(user: AuthUser, buildingId: string, fiscalYearId: string, pagination: Pagination, q?: string) {
    await this.access.assertRoles(user, buildingId, STAFF_ROLES);
    const where: Prisma.ReceiptWhereInput = { buildingId, fiscalYearId, ...this.searchWhere(q) };
    const result = await paginateQuery(
      pagination,
      () => this.prisma.receipt.count({ where }),
      (skip, take) =>
        this.prisma.receipt.findMany({
          where,
          include: RECEIPT_INCLUDE,
          orderBy: [{ date: 'desc' }, { number: 'desc' }],
          skip,
          take,
        }),
      () =>
        this.prisma.receipt.findMany({
          where,
          include: RECEIPT_INCLUDE,
          orderBy: [{ date: 'desc' }, { number: 'desc' }],
        }),
    );
    return { ...result, items: result.items.map((r) => this.map(r)) };
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
    if (type.kind === ReceiptKind.CHARGE) {
      await this.validateChargeLines(dto);
    }
    if (totalAmount <= 0) {
      throw new BadRequestException('مبلغ دریافت باید بیشتر از صفر باشد');
    }
    const number = await this.nextNumber(dto.buildingId, dto.fiscalYearId, fy.title, 'R');
    const receipt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.receipt.create({
        data: {
          buildingId: dto.buildingId,
          fiscalYearId: dto.fiscalYearId,
          receiptTypeId: dto.receiptTypeId,
          unitId: dto.unitId,
          number,
          date: new Date(dto.date),
          totalAmount,
          paymentMethod: dto.paymentMethod,
          description: dto.description,
          createdById: user.id,
          lines: {
            create: dto.lines.map((l) => ({
              chargeInvoiceId: l.chargeInvoiceId,
              amount: l.amount,
              description: l.description,
            })),
          },
        },
        include: RECEIPT_INCLUDE,
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
      if (dto.unitId && type.kind === ReceiptKind.CHARGE) {
        await this.charges.allocateCredit(tx, dto.unitId, dto.fiscalYearId);
      }
      return tx.receipt.findUniqueOrThrow({ where: { id: created.id }, include: RECEIPT_INCLUDE });
    });
    return this.map(receipt);
  }

  private async validateChargeLines(dto: CreateReceiptDto) {
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
      const remaining = money(invoice.amount) - money(invoice.paidAmount);
      if (line.amount > remaining) {
        throw new BadRequestException('مبلغ از مانده بدهی ماه بیشتر است');
      }
    }
  }

  private async nextNumber(buildingId: string, fiscalYearId: string, title: string, prefix: string) {
    const count = await this.prisma.receipt.count({ where: { buildingId, fiscalYearId } });
    return `${prefix}-${title}-${String(count + 1).padStart(4, '0')}`;
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
      { unit: { number: { contains: term, mode } } },
      { unit: { ownerName: { contains: term, mode } } },
      { unit: { residentName: { contains: term, mode } } },
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
    return {
      ...row,
      totalAmount: money(row.totalAmount),
      months,
      monthCount: months.length,
      monthsLabel: this.monthsLabel(months, prepaid),
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
