import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { LISTING_APPROVAL_STATUSES } from '../../common/constants/domain';
import type { ListingApprovalStatus } from '../../common/constants/domain';
import { PaginationDto } from './pagination.dto';

/** Filters for GET /api/admin/listings. All optional and combinable. */
export class ListListingsDto extends PaginationDto {
  @IsOptional()
  @IsIn(LISTING_APPROVAL_STATUSES, {
    message: `status must be one of: ${LISTING_APPROVAL_STATUSES.join(', ')}`,
  })
  status?: ListingApprovalStatus;

  @IsOptional()
  @IsUUID('4', { message: 'sellerId must be a valid UUID' })
  sellerId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId must be a valid UUID' })
  categoryId?: string;

  /** Case-insensitive partial match on the listing name */
  @IsOptional()
  @IsString()
  q?: string;
}
