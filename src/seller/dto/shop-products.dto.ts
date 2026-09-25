import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsPositive,
  Max,
} from 'class-validator';
import { LISTING_APPROVAL_STATUSES } from '../../common/constants/domain';
import type { ListingApprovalStatus } from '../../common/constants/domain';

/** Lower-cases, so ?status=Approved and ?status=approved both work. */
const lowerCased = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Query for GET /api/seller/shop. */
export class ShopProductsDto {
  @IsOptional()
  @Transform(lowerCased)
  @IsIn(LISTING_APPROVAL_STATUSES, {
    message: `status must be one of: ${LISTING_APPROVAL_STATUSES.join(', ')}`,
  })
  status?: ListingApprovalStatus;
}

/**
 * Query for GET /api/seller/shops/nearby.
 *
 * Coordinates are optional here, unlike the buyer's version: a seller's shop
 * already has a position, so by default they look around themselves. Sending
 * them looks around somewhere else instead.
 */
export class NearbySellersDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude?: number;

  /** Kilometres. Defaults to 25, capped at 500. */
  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: 'radiusKm must be greater than 0' })
  @Max(500, { message: 'radiusKm must be 500 or less' })
  radiusKm?: number;
}
