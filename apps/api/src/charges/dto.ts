import { IsUUID } from 'class-validator';

export class GenerateChargesDto {
  @IsUUID()
  fiscalYearId: string;
}
