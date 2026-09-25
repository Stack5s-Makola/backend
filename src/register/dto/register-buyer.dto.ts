import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  normalisedEmail,
  normalisedPhone,
  trimmed,
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

  /** Optional: a buyer can sign up without giving one. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(120)
  name?: string;

  /**
   * Where the buyer is, from the device.
   *
   * Optional, and flat rather than nested so a multipart sign-up can send it.
   * Both or neither - one alone is not a position. The server turns them into
   * a readable place name and stores that too.
   */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude?: number;

  @Transform(upperCased)
  @IsIn(SELF_SERVICE_ROLES, {
    message: `role must be one of: ${SELF_SERVICE_ROLES.join(', ')}`,
  })
  role!: SelfServiceRole;
}
