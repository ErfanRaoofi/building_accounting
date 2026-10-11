import { PaymentMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreatePaymentRequestDto {
  @IsUUID()
  buildingId: string;

  @IsUUID()
  fiscalYearId: string;

  @IsUUID()
  unitId: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  amount: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  description?: string;
}

export class RejectPaymentRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
