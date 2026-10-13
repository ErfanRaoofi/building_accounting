import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BuildingRole, SignupStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }
    const ok = await compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }
    return this.issueSession(user);
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.expiresAt <= new Date() || !row.user.isActive) {
      if (row && !row.revokedAt) {
        await this.prisma.refreshToken.update({
          where: { id: row.id },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('نشست منقضی شده است؛ دوباره وارد شوید');
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(row.user);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return { ok: true };
    }
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      ...this.toUser(user),
      buildings: await this.buildingsFor(user.id, user.isSuperAdmin),
    };
  }

  async publicBuildings() {
    const rows = await this.prisma.building.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return rows;
  }

  async register(dto: RegisterDto) {
    const username = dto.username;
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing?.isActive) {
      throw new BadRequestException('این نام کاربری قبلاً ثبت شده است. وارد شوید');
    }
    const building = await this.prisma.building.findUnique({ where: { id: dto.buildingId } });
    if (!building?.isActive) {
      throw new BadRequestException('ساختمان انتخاب‌شده معتبر نیست');
    }
    const pending = await this.prisma.signupRequest.findFirst({
      where: { username, buildingId: dto.buildingId, status: SignupStatus.PENDING },
    });
    if (pending) {
      throw new BadRequestException('درخواست قبلی برای این ساختمان در انتظار تأیید است');
    }
    await this.prisma.signupRequest.create({
      data: {
        username,
        name: dto.name.trim(),
        passwordHash: await hash(dto.password, 10),
        buildingId: dto.buildingId,
        requestedRole: dto.requestedRole as BuildingRole,
      },
    });
    return { ok: true };
  }

  private async issueSession(user: {
    id: string;
    username: string;
    name: string;
    isSuperAdmin: boolean;
  }) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTtl = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d';
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: addDuration(new Date(), refreshTtl),
      },
    });
    return {
      accessToken,
      refreshToken,
      user: this.toUser(user),
      buildings: await this.buildingsFor(user.id, user.isSuperAdmin),
    };
  }

  private toUser(user: { id: string; username: string; name: string; isSuperAdmin: boolean }) {
    return { id: user.id, username: user.username, name: user.name, isSuperAdmin: user.isSuperAdmin };
  }

  private async buildingsFor(userId: string, isSuperAdmin: boolean) {
    if (isSuperAdmin) {
      const [buildings, accesses] = await Promise.all([
        this.prisma.building.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
        this.prisma.buildingAccess.findMany({ where: { userId } }),
      ]);
      const rolesByBuilding = new Map(accesses.map((row) => [row.buildingId, row.roles]));
      return buildings.map((building) => ({ ...building, roles: rolesByBuilding.get(building.id) || [] }));
    }
    const accesses = await this.prisma.buildingAccess.findMany({
      where: { userId, building: { isActive: true } },
      include: { building: true },
      orderBy: { building: { name: 'asc' } },
    });
    return accesses.map((row) => ({ ...row.building, roles: row.roles }));
  }
}

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

function addDuration(from: Date, duration: string) {
  const match = /^(\d+)([smhd])$/i.exec(duration.trim());
  if (!match) {
    throw new Error(`JWT_REFRESH_EXPIRES_IN نامعتبر است: ${duration}`);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms =
    unit === 's'
      ? amount * 1000
      : unit === 'm'
        ? amount * 60_000
        : unit === 'h'
          ? amount * 3_600_000
          : amount * 86_400_000;
  return new Date(from.getTime() + ms);
}
