import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SignupRequestsService } from './signup-requests.service';
import { ApproveSignupDto, ReviewSignupDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';

@Controller('signup-requests')
export class SignupRequestsController {
  constructor(private signups: SignupRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.signups.list(user, query, parsePagination(query));
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveSignupDto) {
    return this.signups.approve(user, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewSignupDto) {
    return this.signups.reject(user, id, dto);
  }
}
