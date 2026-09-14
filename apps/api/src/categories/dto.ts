import { IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

export class CreateCategoryDto {
  @IsUUID()
  buildingId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;
}
