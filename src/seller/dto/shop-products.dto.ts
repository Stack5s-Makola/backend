import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
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
