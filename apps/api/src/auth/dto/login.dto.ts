import { IsString, MinLength } from 'class-validator';
import { UsernameField } from '../../common/username';

export class LoginDto {
  @UsernameField()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
