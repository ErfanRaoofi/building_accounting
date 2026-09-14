import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AccessService } from '../common/access.service';

@Global()
@Module({
  providers: [PrismaService, AccessService],
  exports: [PrismaService, AccessService],
})
export class PrismaModule {}
