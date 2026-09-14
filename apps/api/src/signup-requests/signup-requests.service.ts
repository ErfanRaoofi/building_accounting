import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BuildingRole, SignupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { paginateQuery, type Pagination } from '../common/pagination';
import { ASSIGNABLE_BY_MANAGER, uniqueRoles } from '../common/roles';
import { ApproveSignupDto, ReviewSignupDto } from './dto';

const INCLUDE = {
  building: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
};

@Injectable()
export class SignupRequestsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async list(user: AuthUser, query: Record<string, string>, pagination: Pagination) {
    const buildingIds = await this.visibleBuildingIds(user);
    if (!buildingIds.length) {
      return { items: [], total: 0, page: pagination.page, pageSize: pagination.pageSize };
    }
    const where = {
      buildingId: { in: buildingIds },
      ...(query.status ? { status: query.status as SignupStatus } : { status: SignupStatus.PENDING }),
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(!user.isSuperAdmin ? { requestedRole: { in: ASSIGNABLE_BY_MANAGER } } : {}),
    };
    if (query.buildingId && !buildingIds.includes(query.buildingId)) {
      throw new NotFoundException('ساختمان یافت نشد');
    }
    return paginateQuery(
      pagination,
      () => this.prisma.signupRequest.count({ where }),
      (skip, take) =>
        this.prisma.signupRequest.findMany({
          where,
          include: INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
      () =>
        this.prisma.signupRequest.findMany({
          where,
          include: INCLUDE,
          orderBy: { createdAt: 'desc' },
        }),
    ).then((result) => ({
      ...result,
      items: result.items.map((row) => this.map(row)),
    }));
  }

  async approve(user: AuthUser, id: string, dto: ApproveSignupDto) {
    const request = await this.getPending(id);
    await this.assertCanReview(user, request.buildingId, request.requestedRole);
    if (request.requestedRole === BuildingRole.RESIDENT && !dto.unitIds?.length) {
      throw new BadRequestException('برای نقش ساکن حداقل یک واحد انتخاب کنید');
    }
    let member = await this.prisma.user.findUnique({ where: { email: request.email } });
    if (!member) {
      member = await this.prisma.user.create({
        data: {
          email: request.email,
          name: request.name,
          passwordHash: request.passwordHash,
        },
      });
    } else if (!member.isActive) {
      member = await this.prisma.user.update({
        where: { id: member.id },
        data: { isActive: true, name: request.name },
      });
    }
    const current = await this.prisma.buildingAccess.findUnique({
      where: { userId_buildingId: { userId: member.id, buildingId: request.buildingId } },
    });
    const roles = uniqueRoles([...(current?.roles || []), request.requestedRole]);
    await this.prisma.buildingAccess.upsert({
      where: { userId_buildingId: { userId: member.id, buildingId: request.buildingId } },
      update: { roles },
      create: { userId: member.id, buildingId: request.buildingId, roles },
    });
    if (request.requestedRole === BuildingRole.RESIDENT) {
      await this.linkUnits(member.id, request.buildingId, dto.unitIds || []);
    }
    const saved = await this.prisma.signupRequest.update({
      where: { id },
      data: {
        status: SignupStatus.APPROVED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        note: dto.note,
      },
      include: INCLUDE,
    });
    return this.map(saved);
  }

  async reject(user: AuthUser, id: string, dto: ReviewSignupDto) {
    const request = await this.getPending(id);
    await this.assertCanReview(user, request.buildingId, request.requestedRole);
    const saved = await this.prisma.signupRequest.update({
      where: { id },
      data: {
        status: SignupStatus.REJECTED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        note: dto.note,
      },
      include: INCLUDE,
    });
    return this.map(saved);
  }

  private async getPending(id: string) {
    const request = await this.prisma.signupRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('درخواست یافت نشد');
    }
    if (request.status !== SignupStatus.PENDING) {
      throw new BadRequestException('این درخواست قبلاً بررسی شده است');
    }
    return request;
  }

  private async assertCanReview(user: AuthUser, buildingId: string, role: BuildingRole) {
    if (role === BuildingRole.MANAGER && !user.isSuperAdmin) {
      throw new BadRequestException('تأیید مدیر ساختمان فقط توسط SuperAdmin انجام می‌شود');
    }
    await this.access.assertRoles(user, buildingId, [BuildingRole.MANAGER]);
    if (!user.isSuperAdmin && !ASSIGNABLE_BY_MANAGER.includes(role)) {
      throw new BadRequestException('اجازه تأیید این نقش را ندارید');
    }
  }

  private async visibleBuildingIds(user: AuthUser) {
    return this.access.managedBuildingIds(user);
  }

  private async linkUnits(userId: string, buildingId: string, unitIds: string[]) {
    const units = await this.prisma.unit.findMany({
      where: { id: { in: unitIds }, buildingId },
      select: { id: true },
    });
    if (units.length !== unitIds.length) {
      throw new BadRequestException('یکی از واحدها به این ساختمان تعلق ندارد');
    }
    await this.prisma.unitResident.createMany({
      data: unitIds.map((unitId) => ({ userId, unitId })),
      skipDuplicates: true,
    });
  }

  private map(row: {
    id: string;
    email: string;
    name: string;
    buildingId: string;
    requestedRole: BuildingRole;
    status: SignupStatus;
    note: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
    building: { id: string; name: string };
    reviewedBy: { id: string; name: string } | null;
  }) {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      buildingId: row.buildingId,
      requestedRole: row.requestedRole,
      status: row.status,
      note: row.note,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
      building: row.building,
      reviewedBy: row.reviewedBy,
    };
  }
}
