import { IsIn, IsString, MinLength } from 'class-validator';
import { UsernameField } from '../../common/username';

export class RegisterDto {
  @UsernameField()
  username: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  buildingId: string;

  @IsIn(['MANAGER', 'ACCOUNTANT', 'BOARD', 'RESIDENT'])
  requestedRole: 'MANAGER' | 'ACCOUNTANT' | 'BOARD' | 'RESIDENT';
}
