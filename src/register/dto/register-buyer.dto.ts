import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Matches, MinLength } from 'class-validator';
import {
  normalisedEmail,
  normalisedPhone,
  upperCased,
} from '../../common/transforms';
import { SELF_SERVICE_ROLES } from './set-seller-profile.dto';
import type { SelfServiceRole } from './set-seller-profile.dto';

/**
 * Body of POST /api/register/buyer.
 *
 * Just the account: no shop, no location. The client sends a plain password
 * and the server hashes it.
 */
export class RegisterBuyerDto {
  @Transform(normalisedEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  // Ghana numbers are 10 digits locally (0241234567) or 12 in full
  // international form (+233241234567); the range covers both.
  @Transform(normalisedPhone)
  @Matches(/^\+?\d{9,15}$/, {
    message: 'Please provide a valid phone number',
  })
  phone!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @Transform(upperCased)
  @IsIn(SELF_SERVICE_ROLES, {
    message: `role must be one of: ${SELF_SERVICE_ROLES.join(', ')}`,
  })
  role!: SelfServiceRole;
}
