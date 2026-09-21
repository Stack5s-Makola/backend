import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  normalisedEmail,
  normalisedPhone,
  trimmed,
  upperCased,
} from '../../common/transforms';

/** The roles a client may ask for. ADMIN is granted, never self-selected. */
export const SELF_SERVICE_ROLES = ['BUYER', 'SELLER'] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

/** Where the shop is. */
export class LocationDto {
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude!: number;

  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude!: number;
}

/**
 * Body of POST /api/register/set-seller-profile.
 *
 * Creates the account and its shop in one step: the client sends a plain
 * password and the server hashes it.
 */
export class SetSellerProfileDto {
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

  /**
   * The person's name.
   *
   * Accepted and validated, but `users` has no column to put it in, so it is
   * not stored. See documentation/pending-profile-fields.md.
   */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(120)
  name!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'shop name is required' })
  @MaxLength(120)
  shopName!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location!: LocationDto;

  @Transform(upperCased)
  @IsIn(SELF_SERVICE_ROLES, {
    message: `role must be one of: ${SELF_SERVICE_ROLES.join(', ')}`,
  })
  role!: SelfServiceRole;
}
