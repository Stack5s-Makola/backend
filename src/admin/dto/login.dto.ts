import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normalisedEmail } from '../../common/transforms';

/** Body of POST /api/admin/login. */
export class AdminLoginDto {
  @Transform(normalisedEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  // No length rule: this checks an existing credential, it does not set one.
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}
