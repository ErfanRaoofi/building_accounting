import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BuildingRole, Prisma, ReceiptKind } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { AddBuildingMemberDto, CreateBuildingDto, UpdateBuildingDto, UpdateBuildingMemberDto } from './dto';
import { jalaliToDate, lastJalaliDay, toJalali } from '../common/jalali';
import { paginateQuery, type Pagination } from '../common/pagination';
import { logoExtension, MAX_LOGO_BYTES, removeBuildingLogoFiles, saveBuildingLogo } from '../common/uploads';
import { ASSIGNABLE_BY_MANAGER, MANAGER_ROLES, STAFF_ROLES, uniqueRoles } from '../common/roles';

@Injectable()
export class BuildingsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(user: AuthUser, pagination: Pagination) {
    if (user.isSuperAdmin) {
      const where = { isActive: true };
      return paginateQuery(
        pagination,
        () => this.prisma.building.count({ where }),
        async (skip, take) => {
          const buildings = await this.prisma.building.findMany({
            where,
            orderBy: { name: 'asc' },
            skip,
            take,
          });
          return this.withRoles(user.id, buildings);
        },
        async () => {
          const buildings = await this.prisma.building.findMany({ where, orderBy: { name: 'asc' } });
          return this.withRoles(user.id, buildings);
        },
      );
    }
    const where = { userId: user.id, building: { isActive: true } };
    return paginateQuery(
      pagination,
      () => this.prisma.buildingAccess.count({ where }),
      async (skip, take) => {
        const accesses = await this.prisma.buildingAccess.findMany({
          where,
          include: { building: true },
          orderBy: { building: { name: 'asc' } },
          skip,
          take,
        });
        return accesses.map((row) => ({ ...row.building, roles: row.roles }));
      },
      async () => {
        const accesses = await this.prisma.buildingAccess.findMany({
          where,
          include: { building: true },
          orderBy: { building: { name: 'asc' } },
        });
        return accesses.map((row) => ({ ...row.building, roles: row.roles }));
      },
    );
  }

  async get(user: AuthUser, id: string) {
    const access = await this.access.getAccess(user, id);
    return { ...access.building, roles: access.roles };
  }

  create(user: AuthUser, dto: CreateBuildingDto) {
    return this.prisma.$transaction(async (tx) => {
      const building = await tx.building.create({
        data: {
          name: dto.name,
          address: dto.address,
          managerName: dto.managerName,
          phone: dto.phone,
        },
      });
      await tx.buildingAccess.create({
        data: { userId: user.id, buildingId: building.id, roles: [BuildingRole.MANAGER] },
      });
      await this.provisionDefaults(tx, building.id);
      return { ...building, roles: [BuildingRole.MANAGER] };
    });
  }

  async members(user: AuthUser, buildingId: string, pagination: Pagination) {
    await this.access.assertRoles(user, buildingId, MANAGER_ROLES);
    const where = { buildingId };
    return paginateQuery(
      pagination,
      () => this.prisma.buildingAccess.count({ where }),
      async (skip, take) => {
        const rows = await this.prisma.buildingAccess.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                isActive: true,
                isSuperAdmin: true,
                unitResidencies: { where: { unit: { buildingId } }, include: { unit: { select: { id: true, number: true } } } },
              },
            },
          },
          orderBy: { user: { name: 'asc' } },
          skip,
          take,
        });
        return rows.map((row) => this.mapMember(row));
      },
      async () => {
        const rows = await this.prisma.buildingAccess.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                isActive: true,
                isSuperAdmin: true,
                unitResidencies: { where: { unit: { buildingId } }, include: { unit: { select: { id: true, number: true } } } },
              },
            },
          },
          orderBy: { user: { name: 'asc' } },
        });
        return rows.map((row) => this.mapMember(row));
      },
    );
  }

  async addMember(user: AuthUser, buildingId: string, dto: AddBuildingMemberDto) {
    const roles = await this.assertAssignable(user, buildingId, dto.roles as BuildingRole[]);
    const email = dto.email.toLowerCase();
    let member = await this.prisma.user.findUnique({ where: { email } });
    if (!member) {
      if (!dto.name || !dto.password) {
        throw new BadRequestException('برای کاربر جدید نام و رمز عبور لازم است');
      }
      member = await this.prisma.user.create({
        data: {
          email,
          name: dto.name,
          passwordHash: await hash(dto.password, 10),
        },
      });
    }
    await this.prisma.buildingAccess.upsert({
      where: { userId_buildingId: { userId: member.id, buildingId } },
      update: { roles },
      create: { userId: member.id, buildingId, roles },
    });
    await this.syncResidentUnits(member.id, buildingId, roles, dto.unitIds);
    return this.memberById(buildingId, member.id);
  }

  async updateMember(user: AuthUser, buildingId: string, userId: string, dto: UpdateBuildingMemberDto) {
    const current = await this.prisma.buildingAccess.findUnique({
      where: { userId_buildingId: { userId, buildingId } },
    });
    if (!current) {
      throw new NotFoundException('این کاربر عضو ساختمان نیست');
    }
    if (current.roles.includes(BuildingRole.MANAGER) && !user.isSuperAdmin) {
      throw new BadRequestException('ویرایش مدیر ساختمان فقط توسط SuperAdmin انجام می‌شود');
    }
    const roles = dto.roles
      ? await this.assertAssignable(user, buildingId, dto.roles as BuildingRole[])
      : current.roles;
    await this.prisma.buildingAccess.update({
      where: { userId_buildingId: { userId, buildingId } },
      data: { roles },
    });
    await this.syncResidentUnits(userId, buildingId, roles, dto.unitIds);
    return this.memberById(buildingId, userId);
  }

  async removeMember(user: AuthUser, buildingId: string, userId: string) {
    await this.access.assertRoles(user, buildingId, MANAGER_ROLES);
    if (userId === user.id) {
      throw new BadRequestException('نمی‌توانید خودتان را از ساختمان حذف کنید');
    }
    const access = await this.prisma.buildingAccess.findUnique({
      where: { userId_buildingId: { userId, buildingId } },
    });
    if (!access) {
      throw new NotFoundException('این کاربر عضو ساختمان نیست');
    }
    if (access.roles.includes(BuildingRole.MANAGER) && !user.isSuperAdmin) {
      throw new BadRequestException('حذف مدیر ساختمان فقط توسط SuperAdmin انجام می‌شود');
    }
    await this.syncResidentUnits(userId, buildingId, [], []);
    await this.prisma.buildingAccess.delete({
      where: { userId_buildingId: { userId, buildingId } },
    });
    return { ok: true };
  }

  async update(user: AuthUser, id: string, dto: UpdateBuildingDto) {
    await this.access.assertRoles(user, id, STAFF_ROLES);
    return this.prisma.building.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.address,
        managerName: dto.managerName,
        phone: dto.phone,
        isActive: dto.isActive,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.access.assertBuilding(user, id);
    const building = await this.prisma.building.findUnique({ where: { id } });
    if (!building) {
      throw new NotFoundException('ساختمان یافت نشد');
    }
    await removeBuildingLogoFiles(id);
    return this.prisma.building.delete({ where: { id } });
  }

  async uploadLogo(user: AuthUser, id: string, file?: { buffer: Buffer; mimetype: string; size: number }) {
    await this.access.assertRoles(user, id, STAFF_ROLES);
    if (!file?.buffer?.length) {
      throw new BadRequestException('فایل لوگو ارسال نشده است');
    }
    if (!logoExtension(file.mimetype)) {
      throw new BadRequestException('فقط تصویر PNG، JPEG یا WebP مجاز است');
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException('حجم لوگو باید کمتر از ۲ مگابایت باشد');
    }
    try {
      const logoUrl = await saveBuildingLogo(id, file);
      return this.prisma.building.update({ where: { id }, data: { logoUrl } });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'invalid-type' || code === 'invalid-png') {
        throw new BadRequestException('فایل لوگو معتبر نیست');
      }
      throw err;
    }
  }

  async removeLogo(user: AuthUser, id: string) {
    await this.access.assertRoles(user, id, STAFF_ROLES);
    await removeBuildingLogoFiles(id);
    return this.prisma.building.update({ where: { id }, data: { logoUrl: null } });
  }

  private async assertAssignable(actor: AuthUser, buildingId: string, roles: BuildingRole[]) {
    await this.access.assertRoles(actor, buildingId, MANAGER_ROLES);
    const unique = uniqueRoles(roles);
    if (!unique.length) {
      throw new BadRequestException('حداقل یک نقش لازم است');
    }
    const forbidden = unique.filter((role) => !ASSIGNABLE_BY_MANAGER.includes(role) && role !== BuildingRole.MANAGER);
    if (forbidden.length) {
      throw new BadRequestException('نقش انتخاب‌شده معتبر نیست');
    }
    if (unique.includes(BuildingRole.MANAGER) && !actor.isSuperAdmin) {
      throw new BadRequestException('ساخت مدیر ساختمان فقط توسط SuperAdmin انجام می‌شود');
    }
    return unique;
  }

  private async syncResidentUnits(userId: string, buildingId: string, roles: BuildingRole[], unitIds?: string[]) {
    if (!roles.includes(BuildingRole.RESIDENT)) {
      await this.prisma.unitResident.deleteMany({
        where: { userId, unit: { buildingId } },
      });
      return;
    }
    if (!unitIds?.length) {
      throw new BadRequestException('برای نقش ساکن حداقل یک واحد انتخاب کنید');
    }
    const units = await this.prisma.unit.findMany({
      where: { id: { in: unitIds }, buildingId },
      select: { id: true },
    });
    if (units.length !== unitIds.length) {
      throw new BadRequestException('یکی از واحدها به این ساختمان تعلق ندارد');
    }
    await this.prisma.unitResident.deleteMany({
      where: { userId, unit: { buildingId } },
    });
    await this.prisma.unitResident.createMany({
      data: unitIds.map((unitId) => ({ userId, unitId })),
    });
  }

  private async memberById(buildingId: string, userId: string) {
    const row = await this.prisma.buildingAccess.findUnique({
      where: { userId_buildingId: { userId, buildingId } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
            isSuperAdmin: true,
            unitResidencies: { where: { unit: { buildingId } }, include: { unit: { select: { id: true, number: true } } } },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('این کاربر عضو ساختمان نیست');
    }
    return this.mapMember(row);
  }

  private mapMember(row: {
    roles: BuildingRole[];
    user: {
      id: string;
      email: string;
      name: string;
      isActive: boolean;
      isSuperAdmin: boolean;
      unitResidencies: { unit: { id: string; number: string } }[];
    };
  }) {
    return {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      isActive: row.user.isActive,
      isSuperAdmin: row.user.isSuperAdmin,
      roles: row.roles,
      units: row.user.unitResidencies.map((item) => item.unit),
    };
  }

  private async withRoles(userId: string, buildings: Array<{ id: string }>) {
    const accesses = await this.prisma.buildingAccess.findMany({
      where: { userId, buildingId: { in: buildings.map((row) => row.id) } },
    });
    const rolesByBuilding = new Map(accesses.map((row) => [row.buildingId, row.roles]));
    return buildings.map((building) => ({ ...building, roles: rolesByBuilding.get(building.id) || [] }));
  }

  private async provisionDefaults(tx: Prisma.TransactionClient, buildingId: string) {
    await tx.receiptType.createMany({
      data: [
        { buildingId, name: 'شارژ', kind: ReceiptKind.CHARGE, isSystem: true },
        { buildingId, name: 'ورودی', kind: ReceiptKind.ENTRANCE, isSystem: true },
        { buildingId, name: 'سایر', kind: ReceiptKind.OTHER, isSystem: true },
      ],
    });
    const bills = await tx.expenseCategory.create({ data: { buildingId, name: 'قبوض' } });
    await tx.expenseCategory.createMany({
      data: [
        { buildingId, parentId: bills.id, name: 'آب' },
        { buildingId, parentId: bills.id, name: 'برق' },
        { buildingId, parentId: bills.id, name: 'گاز' },
        { buildingId, name: 'حقوق نگهبان' },
        { buildingId, name: 'تعمیرات' },
      ],
    });
    const year = toJalali(new Date()).jy;
    await tx.fiscalYear.create({
      data: {
        buildingId,
        title: String(year),
        startDate: jalaliToDate(year, 1, 1),
        endDate: jalaliToDate(year, 12, lastJalaliDay(year, 12)),
      },
    });
  }
}
