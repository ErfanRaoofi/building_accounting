import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BuildingRole, SignupStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    const ok = await compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });
    return {
      accessToken: token,
      user: this.toUser(user),
      buildings: await this.buildingsFor(user.id, user.isSuperAdmin),
    };
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
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.isActive) {
      throw new BadRequestException('این ایمیل قبلاً ثبت شده است. وارد شوید');
    }
    const building = await this.prisma.building.findUnique({ where: { id: dto.buildingId } });
    if (!building?.isActive) {
      throw new BadRequestException('ساختمان انتخاب‌شده معتبر نیست');
    }
    const pending = await this.prisma.signupRequest.findFirst({
      where: { email, buildingId: dto.buildingId, status: SignupStatus.PENDING },
    });
    if (pending) {
      throw new BadRequestException('درخواست قبلی برای این ساختمان در انتظار تأیید است');
    }
    await this.prisma.signupRequest.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await hash(dto.password, 10),
        buildingId: dto.buildingId,
        requestedRole: dto.requestedRole as BuildingRole,
      },
    });
    return { ok: true };
  }

  private toUser(user: { id: string; email: string; name: string; isSuperAdmin: boolean }) {
    return { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin };
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
