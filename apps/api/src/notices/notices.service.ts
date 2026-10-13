import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NoticeBillStatus, NoticeKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { money } from '../common/jalali';
import { paginateQuery, type Pagination } from '../common/pagination';
import { STAFF_ROLES } from '../common/roles';
import { assertStoredImage, mediaUrl, storedBytes } from '../common/uploads';
import { CreateNoticeDto, UpdateNoticeDto } from './dto';

const INCLUDE = {
  image: { select: { id: true } },
  createdBy: { select: { id: true, name: true } },
  payment: {
    select: {
      id: true,
      number: true,
      amount: true,
      date: true,
      proofImage: { select: { id: true } },
    },
  },
} as const;

@Injectable()
export class NoticesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async summary(user: AuthUser, buildingId?: string, fiscalYearId?: string) {
    if (!buildingId || !fiscalYearId) {
      throw new BadRequestException('buildingId و fiscalYearId الزامی است');
    }
    await this.access.assertBuilding(user, buildingId);
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!fy || fy.buildingId !== buildingId) {
      throw new BadRequestException('سال مالی متعلق به این ساختمان نیست');
    }
    const base = { buildingId, fiscalYearId };
    const unpaidWhere = { ...base, kind: NoticeKind.BILL, billStatus: NoticeBillStatus.UNPAID };
    const [unpaidBills, unpaidSum, paidBills, notices] = await Promise.all([
      this.prisma.notice.count({ where: unpaidWhere }),
      this.prisma.notice.aggregate({ where: unpaidWhere, _sum: { amount: true } }),
      this.prisma.notice.count({
        where: { ...base, kind: NoticeKind.BILL, billStatus: NoticeBillStatus.PAID },
      }),
      this.prisma.notice.count({
        where: { ...base, kind: NoticeKind.NOTICE },
      }),
    ]);
    return {
      unpaidBills,
      unpaidAmount: money(unpaidSum._sum.amount),
      paidBills,
      notices,
    };
  }

  async list(
    user: AuthUser,
    query: { buildingId?: string; fiscalYearId?: string; kind?: NoticeKind; billStatus?: NoticeBillStatus },
    pagination: Pagination,
  ) {
    if (!query.buildingId || !query.fiscalYearId) {
      throw new BadRequestException('buildingId و fiscalYearId الزامی است');
    }
    await this.access.assertBuilding(user, query.buildingId);
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id: query.fiscalYearId } });
    if (!fy || fy.buildingId !== query.buildingId) {
      throw new BadRequestException('سال مالی متعلق به این ساختمان نیست');
    }
    const where: Prisma.NoticeWhereInput = {
      buildingId: query.buildingId,
      fiscalYearId: query.fiscalYearId,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.billStatus ? { billStatus: query.billStatus } : {}),
    };
    const result = await paginateQuery(
      pagination,
      () => this.prisma.notice.count({ where }),
      (skip, take) =>
        this.prisma.notice.findMany({
          where,
          include: INCLUDE,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          skip,
          take,
        }),
      () =>
        this.prisma.notice.findMany({
          where,
          include: INCLUDE,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        }),
    );
    return { ...result, items: result.items.map((row) => this.map(row)) };
  }

  async create(
    user: AuthUser,
    dto: CreateNoticeDto,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const fy = await this.access.assertOpenFiscalYear(user, dto.fiscalYearId, STAFF_ROLES);
    if (fy.buildingId !== dto.buildingId) {
      throw new BadRequestException('سال مالی متعلق به این ساختمان نیست');
    }
    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('عنوان الزامی است');
    }
    if (file?.buffer?.length) {
      try {
        assertStoredImage(file);
      } catch (err: any) {
        if (err?.message === 'invalid-type' || err?.message === 'invalid-png') {
          throw new BadRequestException('فرمت تصویر مجاز نیست');
        }
        throw err;
      }
    }

    const amount = dto.amount != null ? Math.round(Number(dto.amount) || 0) : null;
    if (dto.kind === NoticeKind.BILL && amount != null && amount < 1) {
      throw new BadRequestException('مبلغ باید بیشتر از صفر باشد');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.create({
        data: {
          buildingId: dto.buildingId,
          fiscalYearId: dto.fiscalYearId,
          kind: dto.kind,
          title,
          description: dto.description?.trim() || null,
          date: new Date(dto.date),
          amount: dto.kind === NoticeKind.BILL ? amount : null,
          billStatus: dto.kind === NoticeKind.BILL ? NoticeBillStatus.UNPAID : null,
          createdById: user.id,
        },
      });
      if (file?.buffer?.length) {
        await tx.storedImage.create({
          data: {
            mime: file.mimetype,
            data: storedBytes(file.buffer),
            noticeId: notice.id,
          },
        });
      }
      return tx.notice.findUniqueOrThrow({ where: { id: notice.id }, include: INCLUDE });
    });
    return this.map(created);
  }

  async update(user: AuthUser, id: string, dto: UpdateNoticeDto) {
    const notice = await this.prisma.notice.findUnique({ where: { id } });
    if (!notice) {
      throw new NotFoundException('مورد یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, notice.fiscalYearId, STAFF_ROLES);
    if (notice.kind === NoticeKind.BILL && notice.billStatus === NoticeBillStatus.PAID) {
      throw new BadRequestException('قبض پرداخت‌شده قابل ویرایش نیست');
    }
    const amount = dto.amount != null ? Math.round(Number(dto.amount) || 0) : undefined;
    if (amount != null && amount < 1) {
      throw new BadRequestException('مبلغ باید بیشتر از صفر باشد');
    }
    const updated = await this.prisma.notice.update({
      where: { id },
      data: {
        title: dto.title?.trim() || undefined,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        date: dto.date ? new Date(dto.date) : undefined,
        amount: notice.kind === NoticeKind.BILL ? amount : undefined,
      },
      include: INCLUDE,
    });
    return this.map(updated);
  }

  async uploadImage(
    user: AuthUser,
    id: string,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const notice = await this.prisma.notice.findUnique({ where: { id } });
    if (!notice) {
      throw new NotFoundException('مورد یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, notice.fiscalYearId, STAFF_ROLES);
    if (notice.kind === NoticeKind.BILL && notice.billStatus === NoticeBillStatus.PAID) {
      throw new BadRequestException('تصویر قبض پرداخت‌شده قابل تعویض نیست');
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
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.storedImage.deleteMany({ where: { noticeId: id } });
      await tx.storedImage.create({
        data: { mime: file.mimetype, data: storedBytes(file.buffer), noticeId: id },
      });
      return tx.notice.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
    return this.map(updated);
  }

  async removeImage(user: AuthUser, id: string) {
    const notice = await this.prisma.notice.findUnique({ where: { id } });
    if (!notice) {
      throw new NotFoundException('مورد یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, notice.fiscalYearId, STAFF_ROLES);
    if (notice.kind === NoticeKind.BILL && notice.billStatus === NoticeBillStatus.PAID) {
      throw new BadRequestException('تصویر قبض پرداخت‌شده قابل حذف نیست');
    }
    await this.prisma.storedImage.deleteMany({ where: { noticeId: id } });
    const updated = await this.prisma.notice.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    return this.map(updated);
  }

  async remove(user: AuthUser, id: string) {
    const notice = await this.prisma.notice.findUnique({ where: { id } });
    if (!notice) {
      throw new NotFoundException('مورد یافت نشد');
    }
    await this.access.assertOpenFiscalYear(user, notice.fiscalYearId, STAFF_ROLES);
    if (notice.kind === NoticeKind.BILL && notice.billStatus === NoticeBillStatus.PAID) {
      throw new BadRequestException('ابتدا پرداخت این قبض را حذف کنید');
    }
    await this.prisma.notice.delete({ where: { id } });
    return { ok: true };
  }

  private map(row: any) {
    return {
      ...row,
      amount: row.amount == null ? null : money(row.amount),
      imageUrl: row.image?.id ? mediaUrl(row.image.id) : null,
      proofImageUrl: row.payment?.proofImage?.id ? mediaUrl(row.payment.proofImage.id) : null,
      payment: row.payment
        ? {
            id: row.payment.id,
            number: row.payment.number,
            amount: money(row.payment.amount),
            date: row.payment.date,
          }
        : null,
      image: undefined,
    };
  }
}
