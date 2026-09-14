import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateTariffDto {
  @IsUUID()
  buildingId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsNumber()
  @Min(0)
  monthlyAmount: number;
}

export class UpdateTariffDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAmount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
