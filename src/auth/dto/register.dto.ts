import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import {
  normalisedEmail,
  normalisedPhone,
  upperCased,
} from '../../common/transforms';

/** The roles a client may ask for. ADMIN is granted, never self-selected. */
export const SELF_SERVICE_ROLES = ['BUYER', 'SELLER'] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

/**
 * Body of POST /api/auth/register: phone, email and password.
 *
 * Note `password`, not the `passwordHash` that POST /api/users still asks
 * for — the client sends a plain password and the server hashes it.
 */
export class RegisterDto {
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

  @IsOptional()
  @Transform(upperCased)
  @IsIn(SELF_SERVICE_ROLES, {
    message: `role must be one of: ${SELF_SERVICE_ROLES.join(', ')}`,
  })
  role?: SelfServiceRole;
}
