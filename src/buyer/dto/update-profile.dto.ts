import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalisedPhone, trimmed } from '../../common/transforms';

/** Body of POST /api/buyer/my-profile/update/name. */
export class UpdateNameDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(120)
  name!: string;
}

/** Body of POST /api/buyer/my-profile/update/phone. */
export class UpdateBuyerPhoneDto {
  // Ghana numbers are 10 digits locally (0241234567) or 12 in full
  // international form (+233241234567); the range covers both.
  @Transform(normalisedPhone)
  @Matches(/^\+?\d{9,15}$/, {
    message: 'Please provide a valid phone number',
  })
  phone!: string;
}

/**
 * Body of POST /api/buyer/my-profile/update/password.
 *
 * The current password is required even though the caller is already signed
 * in. Tokens here never expire and nothing revokes them, so a token on its
 * own is not proof enough to hand over the account permanently.
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'currentPassword is required' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword!: string;
}
