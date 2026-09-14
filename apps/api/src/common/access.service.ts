import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BuildingRole, FiscalYearStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './decorators/current-user.decorator';
import { ALL_BUILDING_ROLES, RESIDENT_ROLES, STAFF_ROLES } from './roles';

export type BuildingAccessInfo = {
  building: {
    id: string;
    name: string;
    address: string | null;
    managerName: string | null;
    phone: string | null;
    logoUrl: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  roles: BuildingRole[];
  isSuperAdmin: boolean;
};

@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  async getAccess(user: AuthUser, buildingId: string): Promise<BuildingAccessInfo> {
    const building = await this.prisma.building.findUnique({ where: { id: buildingId } });
    if (!building) {
      throw new NotFoundException('ساختمان یافت نشد');
    }
    if (user.isSuperAdmin) {
      const membership = await this.prisma.buildingAccess.findUnique({
        where: { userId_buildingId: { userId: user.id, buildingId } },
      });
      return { building, roles: membership?.roles?.length ? membership.roles : ALL_BUILDING_ROLES, isSuperAdmin: true };
    }
    const access = await this.prisma.buildingAccess.findUnique({
      where: { userId_buildingId: { userId: user.id, buildingId } },
    });
    if (!access) {
      throw new ForbiddenException('به این ساختمان دسترسی ندارید');
    }
    return { building, roles: access.roles, isSuperAdmin: false };
  }

  hasAnyRole(access: BuildingAccessInfo, roles: BuildingRole[]) {
    if (access.isSuperAdmin) {
      return true;
    }
    return roles.some((role) => access.roles.includes(role));
  }

  async assertBuilding(user: AuthUser, buildingId: string) {
    const access = await this.getAccess(user, buildingId);
    return access.building;
  }

  async assertRoles(user: AuthUser, buildingId: string, roles: BuildingRole[]) {
    const access = await this.getAccess(user, buildingId);
    if (!this.hasAnyRole(access, roles)) {
      throw new ForbiddenException('دسترسی کافی نیست');
    }
    return access;
  }

  async assertOpenFiscalYear(user: AuthUser, fiscalYearId: string, roles?: BuildingRole[]) {
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!fy) {
      throw new NotFoundException('سال مالی یافت نشد');
    }
    if (roles?.length) {
      await this.assertRoles(user, fy.buildingId, roles);
    } else {
      await this.assertBuilding(user, fy.buildingId);
    }
    if (fy.status !== FiscalYearStatus.OPEN) {
      throw new ForbiddenException('سال مالی بسته است');
    }
    return fy;
  }

  async assertUnitReadable(user: AuthUser, unitId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) {
      throw new NotFoundException('واحد یافت نشد');
    }
    const access = await this.getAccess(user, unit.buildingId);
    if (this.hasAnyRole(access, STAFF_ROLES)) {
      return unit;
    }
    if (this.hasAnyRole(access, RESIDENT_ROLES)) {
      const link = await this.prisma.unitResident.findUnique({
        where: { userId_unitId: { userId: user.id, unitId } },
      });
      if (link) {
        return unit;
      }
    }
    throw new ForbiddenException('به این واحد دسترسی ندارید');
  }

  async residentUnitIds(user: AuthUser, buildingId: string) {
    const rows = await this.prisma.unitResident.findMany({
      where: { userId: user.id, unit: { buildingId } },
      select: { unitId: true },
    });
    return rows.map((row) => row.unitId);
  }

  async managedBuildingIds(user: AuthUser) {
    if (user.isSuperAdmin) {
      const rows = await this.prisma.building.findMany({ select: { id: true } });
      return rows.map((row) => row.id);
    }
    const rows = await this.prisma.buildingAccess.findMany({
      where: { userId: user.id, roles: { has: BuildingRole.MANAGER } },
      select: { buildingId: true },
    });
    return rows.map((row) => row.buildingId);
  }
}
