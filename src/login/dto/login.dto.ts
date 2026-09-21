import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normalisedEmail } from '../../common/transforms';

/** Body of POST /api/login. */
export class LoginDto {
  @Transform(normalisedEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  // No length rule here: an old password that no longer meets the current
  // minimum must still be able to sign in.
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}
