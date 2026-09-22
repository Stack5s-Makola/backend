import { Transform, Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { trimmed } from '../../common/transforms';

/**
 * Query for GET /api/buyer/products.
 *
 * All optional. Without coordinates the endpoint returns everything on sale;
 * with them it returns only what is within `radiusKm` of the caller, nearest
 * first. The app has the device's location, the account does not - nothing on
 * the user row stores where a buyer is.
 */
export class BrowseProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude?: number;

  /** Kilometres. Ignored unless both coordinates are given. */
  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: 'radiusKm must be greater than 0' })
  @Max(500, { message: 'radiusKm must be 500 or less' })
  radiusKm?: number;

  /** A category name, matched whole and without regard to case. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(80)
  category?: string;
}

/** Query for GET /api/buyer/products/search. */
export class SearchProductsDto extends BrowseProductsDto {
  /**
   * What the shopper typed. Matched against the name and the category.
   *
   * Decorator order matters: class-validator runs them bottom up, and the
   * error map keeps the first failure, so IsNotEmpty has to sit last or a
   * missing `q` is reported as being too long.
   */
  @Transform(trimmed)
  @MaxLength(80)
  @IsString({ message: 'q is required' })
  @IsNotEmpty({ message: 'q is required' })
  q!: string;
}
