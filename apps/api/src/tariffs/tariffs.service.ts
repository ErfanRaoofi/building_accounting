import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateTariffDto, UpdateTariffDto } from './dto';
import { money } from '../common/jalali';
import { paginateQuery, type Pagination } from '../common/pagination';
import { STAFF_ROLES } from '../common/roles';

@Injectable()
export class TariffsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(user: AuthUser, buildingId: string, pagination: Pagination) {
    await this.access.assertRoles(user, buildingId, STAFF_ROLES);
    const where = { buildingId };
    const result = await paginateQuery(
      pagination,
      () => this.prisma.chargeTariff.count({ where }),
      (skip, take) => this.prisma.chargeTariff.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      () => this.prisma.chargeTariff.findMany({ where, orderBy: { name: 'asc' } }),
    );
    return { ...result, items: result.items.map((t) => ({ ...t, monthlyAmount: money(t.monthlyAmount) })) };
  }

  async create(user: AuthUser, dto: CreateTariffDto) {
    await this.access.assertRoles(user, dto.buildingId, STAFF_ROLES);
    const row = await this.prisma.chargeTariff.create({
      data: { buildingId: dto.buildingId, name: dto.name, monthlyAmount: dto.monthlyAmount },
    });
    return { ...row, monthlyAmount: money(row.monthlyAmount) };
  }

  async update(user: AuthUser, id: string, dto: UpdateTariffDto) {
    const tariff = await this.prisma.chargeTariff.findUnique({ where: { id } });
    if (!tariff) {
      throw new NotFoundException('تعرفه یافت نشد');
    }
    await this.access.assertRoles(user, tariff.buildingId, STAFF_ROLES);
    const row = await this.prisma.chargeTariff.update({
      where: { id },
      data: {
        name: dto.name,
        monthlyAmount: dto.monthlyAmount,
        isActive: dto.isActive,
      },
    });
    return { ...row, monthlyAmount: money(row.monthlyAmount) };
  }
}
