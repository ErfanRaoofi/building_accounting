import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreatePaymentDto, UpdatePaymentDto } from './dto';
import { money } from '../common/jalali';
import { paginateQuery, type Pagination } from '../common/pagination';
import { STAFF_ROLES } from '../common/roles';

function optionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function presentPayment<T extends { amount: unknown; depositAmount: unknown; balance: unknown }>(row: T) {
  return {
    ...row,
    amount: money(row.amount),
    depositAmount: money(row.depositAmount),
    balance: row.balance == null ? null : money(row.balance),
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(user: AuthUser, buildingId: string, fiscalYearId: string, pagination: Pagination, categoryId?: string) {
    await this.access.assertRoles(user, buildingId, STAFF_ROLES);
    const where = { buildingId, fiscalYearId, ...(categoryId ? { categoryId } : {}) };
    const result = await paginateQuery(
      pagination,
      () => this.prisma.payment.count({ where }),
      (skip, take) =>
        this.prisma.payment.findMany({
          where,
          include: { category: { include: { parent: true } } },
          orderBy: { date: 'desc' },
          skip,
          take,
        }),
      () =>
        this.prisma.payment.findMany({
          where,
          include: { category: { include: { parent: true } } },
          orderBy: { date: 'desc' },
        }),
    );
    return { ...result, items: result.items.map((p) => presentPayment(p)) };
  }

  async create(user: AuthUser, dto: CreatePaymentDto) {
    const fy = await this.access.assertOpenFiscalYear(user, dto.fiscalYearId, STAFF_ROLES);
    if (fy.buildingId !== dto.buildingId) {
      throw new BadRequestException('سال مالی متعلق به این ساختمان نیست');
    }
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category || category.buildingId !== dto.buildingId) {
      throw new NotFoundException('سرفصل هزینه یافت نشد');
    }
    const count = await this.prisma.payment.count({
      where: { buildingId: dto.buildingId, fiscalYearId: dto.fiscalYearId },
    });
    const number = `P-${fy.title}-${String(count + 1).padStart(4, '0')}`;
    const row = await this.prisma.payment.create({
      data: {
        buildingId: dto.buildingId,
        fiscalYearId: dto.fiscalYearId,
        categoryId: dto.categoryId,
        number,
        date: new Date(dto.date),
        amount: dto.amount,
        depositAmount: dto.depositAmount ?? 0,
        balance: dto.balance ?? null,
        transactionTime: optionalText(dto.transactionTime),
        operation: optionalText(dto.operation),
        documentNumber: optionalText(dto.documentNumber),
        depositReference: optionalText(dto.depositReference),
        trackingNumber: optionalText(dto.trackingNumber),
        payee: dto.payee,
        paymentMethod: dto.paymentMethod,
        description: dto.description,
        createdById: user.id,
      },
      include: { category: { include: { parent: true } } },
    });
    return presentPayment(row);
  }

  async update(user: AuthUser, id: string, dto: UpdatePaymentDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, payment.fiscalYearId, STAFF_ROLES);
    if (dto.categoryId) {
      const category = await this.prisma.expenseCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category || category.buildingId !== payment.buildingId) {
        throw new NotFoundException('سرفصل هزینه یافت نشد');
      }
    }
    const row = await this.prisma.payment.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        date: dto.date ? new Date(dto.date) : undefined,
        amount: dto.amount,
        depositAmount: dto.depositAmount,
        balance: dto.balance,
        transactionTime: optionalText(dto.transactionTime),
        operation: optionalText(dto.operation),
        documentNumber: optionalText(dto.documentNumber),
        depositReference: optionalText(dto.depositReference),
        trackingNumber: optionalText(dto.trackingNumber),
        payee: dto.payee,
        paymentMethod: dto.paymentMethod,
        description: dto.description,
      },
      include: { category: { include: { parent: true } } },
    });
    return presentPayment(row);
  }

  async remove(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, payment.fiscalYearId, STAFF_ROLES);
    await this.prisma.payment.delete({ where: { id } });
    return { ok: true };
  }
}
