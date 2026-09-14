import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateFiscalYearDto {
  @IsUUID()
  buildingId: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class UpdateFiscalYearDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
