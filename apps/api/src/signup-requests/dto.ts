import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewSignupDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unitIds?: string[];
}

export class ApproveSignupDto extends ReviewSignupDto {
  @IsIn(['APPROVE'])
  confirm: 'APPROVE';
}
