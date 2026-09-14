import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FiscalYearStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateFiscalYearDto, UpdateFiscalYearDto } from './dto';
import { paginateQuery, type Pagination } from '../common/pagination';
import { STAFF_ROLES } from '../common/roles';

@Injectable()
export class FiscalYearsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(user: AuthUser, buildingId: string, pagination: Pagination) {
    await this.access.assertBuilding(user, buildingId);
    const where = { buildingId };
    return paginateQuery(
      pagination,
      () => this.prisma.fiscalYear.count({ where }),
      (skip, take) => this.prisma.fiscalYear.findMany({ where, orderBy: { startDate: 'desc' }, skip, take }),
      () => this.prisma.fiscalYear.findMany({ where, orderBy: { startDate: 'desc' } }),
    );
  }

  async create(user: AuthUser, dto: CreateFiscalYearDto) {
    await this.access.assertRoles(user, dto.buildingId, STAFF_ROLES);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) {
      throw new BadRequestException('تاریخ پایان باید بعد از شروع باشد');
    }
    const open = await this.prisma.fiscalYear.findFirst({
      where: { buildingId: dto.buildingId, status: FiscalYearStatus.OPEN },
    });
    if (open) {
      throw new BadRequestException('ابتدا سال مالی باز فعلی را ببندید');
    }
    return this.prisma.fiscalYear.create({
      data: {
        buildingId: dto.buildingId,
        title: dto.title,
        startDate: start,
        endDate: end,
      },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateFiscalYearDto) {
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id } });
    if (!fy) {
      throw new NotFoundException('سال مالی یافت نشد');
    }
    await this.access.assertRoles(user, fy.buildingId, STAFF_ROLES);
    return this.prisma.fiscalYear.update({
      where: { id },
      data: {
        title: dto.title,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async close(user: AuthUser, id: string) {
    const fy = await this.access.assertOpenFiscalYear(user, id, STAFF_ROLES);
    return this.prisma.fiscalYear.update({
      where: { id: fy.id },
      data: { status: FiscalYearStatus.CLOSED },
    });
  }
}
