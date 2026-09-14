import { Module } from '@nestjs/common';
import { SignupRequestsController } from './signup-requests.controller';
import { SignupRequestsService } from './signup-requests.service';

@Module({
  controllers: [SignupRequestsController],
  providers: [SignupRequestsService],
})
export class SignupRequestsModule {}
