import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NoticeBillStatus, NoticeKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreatePaymentDto, UpdatePaymentDto } from './dto';
import { money } from '../common/jalali';
import { paginateQuery, type Pagination } from '../common/pagination';
import { STAFF_ROLES } from '../common/roles';
import { assertStoredImage, mediaUrl, storedBytes } from '../common/uploads';

function optionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

const INCLUDE = {
  category: { include: { parent: true } },
  proofImage: { select: { id: true } },
  notice: {
    select: {
      id: true,
      title: true,
      kind: true,
      billStatus: true,
      image: { select: { id: true } },
    },
  },
} as const;

function presentPayment(row: any) {
  return {
    ...row,
    amount: money(row.amount),
    depositAmount: money(row.depositAmount),
    balance: row.balance == null ? null : money(row.balance),
    billImageUrl: row.notice?.image?.id ? mediaUrl(row.notice.image.id) : null,
    proofImageUrl: row.proofImage?.id ? mediaUrl(row.proofImage.id) : null,
    notice: row.notice
      ? {
          id: row.notice.id,
          title: row.notice.title,
          kind: row.notice.kind,
          billStatus: row.notice.billStatus,
        }
      : null,
    proofImage: undefined,
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
          include: INCLUDE,
          orderBy: { date: 'desc' },
          skip,
          take,
        }),
      () =>
        this.prisma.payment.findMany({
          where,
          include: INCLUDE,
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

    let noticeId: string | null = null;
    if (dto.noticeId) {
      const notice = await this.prisma.notice.findUnique({ where: { id: dto.noticeId } });
      if (!notice) {
        throw new NotFoundException('قبض یافت نشد');
      }
      if (notice.buildingId !== dto.buildingId || notice.fiscalYearId !== dto.fiscalYearId) {
        throw new BadRequestException('قبض متعلق به این ساختمان یا سال مالی نیست');
      }
      if (notice.kind !== NoticeKind.BILL) {
        throw new BadRequestException('فقط قبض قابل پرداخت است');
      }
      if (notice.billStatus !== NoticeBillStatus.UNPAID) {
        throw new BadRequestException('این قبض قبلاً پرداخت شده است');
      }
      noticeId = notice.id;
    }

    const count = await this.prisma.payment.count({
      where: { buildingId: dto.buildingId, fiscalYearId: dto.fiscalYearId },
    });
    const number = `P-${fy.title}-${String(count + 1).padStart(4, '0')}`;

    const row = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          buildingId: dto.buildingId,
          fiscalYearId: dto.fiscalYearId,
          categoryId: dto.categoryId,
          noticeId,
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
        include: INCLUDE,
      });
      if (noticeId) {
        await tx.notice.update({
          where: { id: noticeId },
          data: { billStatus: NoticeBillStatus.PAID },
        });
      }
      return payment;
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
      include: INCLUDE,
    });
    return presentPayment(row);
  }

  async uploadProof(
    user: AuthUser,
    id: string,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, payment.fiscalYearId, STAFF_ROLES);
    if (!payment.noticeId) {
      throw new BadRequestException('رسید پرداخت فقط برای پرداختِ قبض ثبت می‌شود');
    }
    if (!file || !file.buffer.length) {
      throw new BadRequestException('فایل تصویر ارسال نشده است');
    }
    try {
      assertStoredImage(file);
    } catch (err: any) {
      if (err?.message === 'invalid-type' || err?.message === 'invalid-png') {
        throw new BadRequestException('فرمت تصویر مجاز نیست');
      }
      throw err;
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.storedImage.deleteMany({ where: { paymentId: id } });
      await tx.storedImage.create({
        data: { mime: file.mimetype, data: storedBytes(file.buffer), paymentId: id },
      });
      return tx.payment.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
    return presentPayment(row);
  }

  async removeProof(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, payment.fiscalYearId, STAFF_ROLES);
    await this.prisma.storedImage.deleteMany({ where: { paymentId: id } });
    const row = await this.prisma.payment.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    return presentPayment(row);
  }

  async remove(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, payment.fiscalYearId, STAFF_ROLES);
    await this.prisma.$transaction(async (tx) => {
      if (payment.noticeId) {
        await tx.notice.update({
          where: { id: payment.noticeId },
          data: { billStatus: NoticeBillStatus.UNPAID },
        });
      }
      await tx.payment.delete({ where: { id } });
    });
    return { ok: true };
  }
}
