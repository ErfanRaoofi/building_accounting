import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { FiscalYearsModule } from '../fiscal-years/fiscal-years.module';
import { TariffsModule } from '../tariffs/tariffs.module';
import { UnitsModule } from '../units/units.module';
import { ChargesModule } from '../charges/charges.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { CategoriesModule } from '../categories/categories.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReportsModule } from '../reports/reports.module';
import { BackupsModule } from '../backups/backups.module';
import { SignupRequestsModule } from '../signup-requests/signup-requests.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    BuildingsModule,
    FiscalYearsModule,
    TariffsModule,
    UnitsModule,
    ChargesModule,
    ReceiptsModule,
    CategoriesModule,
    PaymentsModule,
    ReportsModule,
    BackupsModule,
    SignupRequestsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
