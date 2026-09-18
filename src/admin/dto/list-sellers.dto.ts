import { IsIn, IsOptional, IsString } from 'class-validator';
import { SELLER_VERIFICATION_STATUSES } from '../../common/constants/domain';
import type { SellerVerificationStatus } from '../../common/constants/domain';
import { PaginationDto } from './pagination.dto';

/** Optional ?verificationStatus= and ?q= (shop name) for GET /api/admin/sellers. */
export class ListSellersDto extends PaginationDto {
  @IsOptional()
  @IsIn(SELLER_VERIFICATION_STATUSES, {
    message: `verificationStatus must be one of: ${SELLER_VERIFICATION_STATUSES.join(', ')}`,
  })
  verificationStatus?: SellerVerificationStatus;

  @IsOptional()
  @IsString()
  q?: string;
}
