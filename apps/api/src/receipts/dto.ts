import { PaymentMethod, ReceiptKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateReceiptTypeDto {
  @IsUUID()
  buildingId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(ReceiptKind)
  kind: ReceiptKind;
}

export class UpdateReceiptTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(ReceiptKind)
  kind?: ReceiptKind;
}

export class ReceiptLineDto {
  @IsOptional()
  @IsUUID()
  chargeInvoiceId?: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateReceiptDto {
  @IsUUID()
  buildingId: string;

  @IsUUID()
  fiscalYearId: string;

  @IsUUID()
  receiptTypeId: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines: ReceiptLineDto[];
}
