import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimmed } from '../../common/transforms';

/**
 * A comma separated list, or a repeated form field, into an array of tags.
 *
 * Multipart cannot send JSON arrays, so the app sends "kente,cloth,handmade"
 * or repeats `tags` - both land here.
 */
function toTags({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) {
    return clean(value.map((tag) => (typeof tag === 'string' ? tag : '')));
  }

  if (typeof value === 'string') {
    return clean(value.split(','));
  }

  // Anything else - a number, an object - is not a tag list. Hand it back so
  // the validator reports it rather than silently turning it into nonsense.
  return value;
}

/** Trims, lower-cases, drops the blanks, and caps the list. */
function clean(tags: string[]) {
  return tags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

/** Body of POST /api/seller/add. Accepts JSON or multipart with an `image`. */
export class AddProductDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(120)
  name!: string;

  /** A category name. Created if it does not exist yet. */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'category is required' })
  @MaxLength(80)
  category!: string;

  @IsOptional()
  @Transform(toTags)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @Type(() => Number)
  @IsPositive({ message: 'price must be greater than 0' })
  price!: number;

  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @Min(0, { message: 'quantity cannot be negative' })
  @Max(1_000_000)
  quantity!: number;

  /**
   * Where the product is sold from.
   *
   * Optional: a listing has no location column of its own, so these move the
   * shop's coordinates instead. Left out, the shop stays where it is.
   */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude?: number;
}
