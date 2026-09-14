import { OccupancyStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateUnitDto {
  @IsUUID()
  buildingId: string;

  @IsString()
  @MinLength(1)
  number: string;

  @IsOptional()
  @IsInt()
  floor?: number;

  @IsOptional()
  @IsNumber()
  area?: number;

  @IsOptional()
  @IsInt()
  bedrooms?: number;

  @IsOptional()
  @IsEnum(OccupancyStatus)
  occupancy?: OccupancyStatus;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  residentName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUUID()
  tariffId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customMonthlyCharge?: number;
}

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsInt()
  floor?: number;

  @IsOptional()
  @IsNumber()
  area?: number;

  @IsOptional()
  @IsInt()
  bedrooms?: number;

  @IsOptional()
  @IsEnum(OccupancyStatus)
  occupancy?: OccupancyStatus;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  residentName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  tariffId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customMonthlyCharge?: number | null;

  @IsOptional()
  isActive?: boolean;
}
