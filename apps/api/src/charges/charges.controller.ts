import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ChargesService } from './charges.service';
import { GenerateChargesDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('charges')
export class ChargesController {
  constructor(private charges: ChargesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('fiscalYearId') fiscalYearId: string,
    @Query('unitId') unitId?: string,
  ) {
    return this.charges.list(user, fiscalYearId, unitId);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateChargesDto) {
    return this.charges.generate(user, dto.fiscalYearId);
  }
}
