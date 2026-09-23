import { Transform, Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { normalisedPhone, trimmed } from '../../common/transforms';

/** Body of POST /api/seller/me/update/shop-name. */
export class UpdateShopNameDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'shopName is required' })
  @MaxLength(120)
  shopName!: string;
}

/** Body of POST /api/seller/me/update/location. */
export class UpdateLocationDto {
  @Type(() => Number)
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude!: number;

  @Type(() => Number)
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude!: number;
}

/** Body of POST /api/seller/me/update/phone. */
export class UpdatePhoneDto {
  // Ghana numbers are 10 digits locally (0241234567) or 12 in full
  // international form (+233241234567); the range covers both.
  @Transform(normalisedPhone)
  @Matches(/^\+?\d{9,15}$/, {
    message: 'Please provide a valid phone number',
  })
  phone!: string;
}
