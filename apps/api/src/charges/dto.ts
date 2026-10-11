import { OccupancyStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsUUID, Min } from 'class-validator';

export class GenerateChargesDto {
  @IsUUID()
  fiscalYearId: string;
}

export class SetInvoiceOccupancyDto {
  @IsEnum(OccupancyStatus)
  occupancy: OccupancyStatus;
}

export class SetInvoicePaidDto {
  @IsNumber()
  @Min(0)
  paidAmount: number;
}
