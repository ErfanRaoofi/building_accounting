import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateBackupSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  keepLast?: number;
}

export class RestoreBackupDto {
  @IsString()
  confirm: string;
}
