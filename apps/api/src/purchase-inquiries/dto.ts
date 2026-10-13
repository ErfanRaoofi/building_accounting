import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePurchaseInquiryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود' })
  mobile: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  buildingName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  planId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  planLabel: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
