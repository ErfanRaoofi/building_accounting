import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { paginateQuery, type Pagination } from '../common/pagination';
import { STAFF_ROLES } from '../common/roles';

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(user: AuthUser, buildingId: string, pagination: Pagination) {
    await this.access.assertRoles(user, buildingId, STAFF_ROLES);
    const where = { buildingId };
    return paginateQuery(
      pagination,
      () => this.prisma.expenseCategory.count({ where }),
      (skip, take) =>
        this.prisma.expenseCategory.findMany({
          where,
          include: { children: true, parent: true },
          orderBy: { name: 'asc' },
          skip,
          take,
        }),
      () =>
        this.prisma.expenseCategory.findMany({
          where,
          include: { children: true, parent: true },
          orderBy: { name: 'asc' },
        }),
    );
  }

  async create(user: AuthUser, dto: CreateCategoryDto) {
    await this.access.assertRoles(user, dto.buildingId, STAFF_ROLES);
    return this.prisma.expenseCategory.create({ data: dto });
  }

  async update(user: AuthUser, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('سرفصل هزینه یافت نشد');
    }
    await this.access.assertRoles(user, category.buildingId, STAFF_ROLES);
    if (dto.parentId === id) {
      throw new BadRequestException('سرفصل نمی‌تواند زیرمجموعه خودش باشد');
    }
    if (dto.parentId) {
      const parent = await this.prisma.expenseCategory.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.buildingId !== category.buildingId) {
        throw new NotFoundException('سرفصل والد یافت نشد');
      }
      if (parent.parentId) {
        throw new BadRequestException('فقط یک سطح زیرمجموعه مجاز است');
      }
      const childCount = await this.prisma.expenseCategory.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new BadRequestException('این سرفصل زیردسته دارد و نمی‌تواند زیرمجموعه شود');
      }
    }
    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        name: dto.name,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
      },
    });
  }
}
