import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentRequestStatus, Prisma, ReceiptKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { money } from '../common/jalali';
import { paginateQuery, type Pagination } from '../common/pagination';
import { RESIDENT_ROLES, STAFF_ROLES } from '../common/roles';
import {
  imageExtension,
  MAX_PAYMENT_REQUEST_IMAGE_BYTES,
  removePaymentRequestImage,
  savePaymentRequestImage,
} from '../common/uploads';
import { ReceiptsService } from '../receipts/receipts.service';
import { CreatePaymentRequestDto, RejectPaymentRequestDto } from './dto';

const INCLUDE = {
  unit: { select: { id: true, number: true, ownerName: true, residentName: true } },
  submittedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  receipt: { select: { id: true, number: true } },
} as const;

@Injectable()
export class PaymentRequestsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private receipts: ReceiptsService,
  ) {}

  async list(
    user: AuthUser,
    query: {
      buildingId?: string;
      fiscalYearId?: string;
      unitId?: string;
      status?: PaymentRequestStatus;
    },
    pagination: Pagination,
  ) {
    if (query.unitId) {
      await this.access.assertUnitReadable(user, query.unitId);
      const where: Prisma.PaymentRequestWhereInput = {
        unitId: query.unitId,
        ...(query.fiscalYearId ? { fiscalYearId: query.fiscalYearId } : {}),
        ...(query.status ? { status: query.status } : {}),
      };
      return this.paged(where, pagination);
    }

    if (!query.buildingId) {
      throw new BadRequestException('buildingId یا unitId الزامی است');
    }
    await this.access.assertRoles(user, query.buildingId, STAFF_ROLES);
    const where: Prisma.PaymentRequestWhereInput = {
      buildingId: query.buildingId,
      ...(query.fiscalYearId ? { fiscalYearId: query.fiscalYearId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    return this.paged(where, pagination);
  }

  async create(
    user: AuthUser,
    dto: CreatePaymentRequestDto,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const fy = await this.access.assertOpenFiscalYear(user, dto.fiscalYearId);
    if (fy.buildingId !== dto.buildingId) {
      throw new BadRequestException('سال مالی متعلق به این ساختمان نیست');
    }
    await this.assertResidentOfUnit(user, dto.unitId, dto.buildingId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('تصویر فیش الزامی است');
    }
    if (file.size > MAX_PAYMENT_REQUEST_IMAGE_BYTES) {
      throw new BadRequestException('حجم تصویر بیش از حد مجاز است');
    }
    if (!imageExtension(file.mimetype)) {
      throw new BadRequestException('فرمت تصویر مجاز نیست');
    }
    const amount = Math.round(Number(dto.amount) || 0);
    if (amount < 1) {
      throw new BadRequestException('مبلغ باید بیشتر از صفر باشد');
    }

    let imagePath: string;
    try {
      imagePath = await savePaymentRequestImage(file);
    } catch (err: any) {
      if (err?.message === 'invalid-type' || err?.message === 'invalid-png') {
        throw new BadRequestException('فرمت تصویر مجاز نیست');
      }
      throw err;
    }

    try {
      const created = await this.prisma.paymentRequest.create({
        data: {
          buildingId: dto.buildingId,
          fiscalYearId: dto.fiscalYearId,
          unitId: dto.unitId,
          amount,
          date: new Date(dto.date),
          paymentMethod: dto.paymentMethod || PaymentMethod.TRANSFER,
          description: dto.description?.trim() || null,
          imagePath,
          submittedById: user.id,
        },
        include: INCLUDE,
      });
      return this.map(created);
    } catch (err) {
      await removePaymentRequestImage(imagePath);
      throw err;
    }
  }

  async approve(user: AuthUser, id: string) {
    const request = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('درخواست یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, request.fiscalYearId, STAFF_ROLES);
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException('این درخواست قبلاً بررسی شده است');
    }

    const receiptType = await this.prisma.receiptType.findFirst({
      where: { buildingId: request.buildingId, kind: ReceiptKind.CHARGE },
      orderBy: { createdAt: 'asc' },
    });
    if (!receiptType) {
      throw new BadRequestException('نوع دریافت شارژ برای این ساختمان تعریف نشده است');
    }

    const amount = money(request.amount);
    const lines = await this.buildChargeLines(request.unitId, request.fiscalYearId, amount);
    const description = [request.description?.trim(), 'تأیید درخواست پرداخت ساکن'].filter(Boolean).join(' · ');

    const receipt = await this.receipts.create(user, {
      buildingId: request.buildingId,
      fiscalYearId: request.fiscalYearId,
      receiptTypeId: receiptType.id,
      unitId: request.unitId,
      date: request.date.toISOString().slice(0, 10),
      paymentMethod: request.paymentMethod,
      description,
      lines,
    });

    const updated = await this.prisma.paymentRequest.update({
      where: { id },
      data: {
        status: PaymentRequestStatus.APPROVED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        receiptId: receipt.id,
        rejectReason: null,
      },
      include: INCLUDE,
    });
    return this.map(updated);
  }

  async reject(user: AuthUser, id: string, dto: RejectPaymentRequestDto) {
    const request = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('درخواست یافت نشد');
    }
    await this.access.assertRoles(user, request.buildingId, STAFF_ROLES);
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException('این درخواست قبلاً بررسی شده است');
    }
    const updated = await this.prisma.paymentRequest.update({
      where: { id },
      data: {
        status: PaymentRequestStatus.REJECTED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        rejectReason: dto.reason?.trim() || null,
      },
      include: INCLUDE,
    });
    return this.map(updated);
  }

  private async assertResidentOfUnit(user: AuthUser, unitId: string, buildingId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.buildingId !== buildingId) {
      throw new BadRequestException('واحد متعلق به این ساختمان نیست');
    }
    const access = await this.access.getAccess(user, buildingId);
    if (!this.access.hasAnyRole(access, RESIDENT_ROLES)) {
      throw new ForbiddenException('فقط ساکن واحد می‌تواند درخواست پرداخت ثبت کند');
    }
    const link = await this.prisma.unitResident.findUnique({
      where: { userId_unitId: { userId: user.id, unitId } },
    });
    if (!link) {
      throw new ForbiddenException('به این واحد دسترسی ندارید');
    }
  }

  private async buildChargeLines(unitId: string, fiscalYearId: string, amount: number) {
    const invoices = await this.prisma.chargeInvoice.findMany({
      where: { unitId, fiscalYearId },
      orderBy: [{ jalaliYear: 'asc' }, { jalaliMonth: 'asc' }],
    });
    const lines: { chargeInvoiceId?: string; amount: number; description?: string }[] = [];
    let left = amount;
    for (const invoice of invoices) {
      if (left <= 0) {
        break;
      }
      const remaining = money(invoice.amount) - money(invoice.paidAmount);
      if (remaining <= 0) {
        continue;
      }
      const take = Math.min(remaining, left);
      lines.push({ chargeInvoiceId: invoice.id, amount: take });
      left -= take;
    }
    if (left > 0) {
      lines.push({ amount: left, description: 'پیش‌پرداخت / بستانکار' });
    }
    if (!lines.length) {
      lines.push({ amount, description: 'پیش‌پرداخت / بستانکار' });
    }
    return lines;
  }

  private async paged(where: Prisma.PaymentRequestWhereInput, pagination: Pagination) {
    const result = await paginateQuery(
      pagination,
      () => this.prisma.paymentRequest.count({ where }),
      (skip, take) =>
        this.prisma.paymentRequest.findMany({
          where,
          include: INCLUDE,
          orderBy: [{ createdAt: 'desc' }],
          skip,
          take,
        }),
      () =>
        this.prisma.paymentRequest.findMany({
          where,
          include: INCLUDE,
          orderBy: [{ createdAt: 'desc' }],
        }),
    );
    return { ...result, items: result.items.map((row) => this.map(row)) };
  }

  private map(row: any) {
    return {
      ...row,
      amount: money(row.amount),
    };
  }
}
