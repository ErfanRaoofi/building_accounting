import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBuildingDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateBuildingDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

const BUILDING_ROLES = ['MANAGER', 'ACCOUNTANT', 'BOARD', 'RESIDENT'] as const;

export class AddBuildingMemberDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(BUILDING_ROLES, { each: true })
  roles: Array<(typeof BUILDING_ROLES)[number]>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unitIds?: string[];
}

export class UpdateBuildingMemberDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(BUILDING_ROLES, { each: true })
  roles?: Array<(typeof BUILDING_ROLES)[number]>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unitIds?: string[];
}
