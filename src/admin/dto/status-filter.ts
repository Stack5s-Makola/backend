import { IsIn, IsOptional } from 'class-validator';
import { USER_STATUSES } from '../../common/constants/domain';
import type { UserStatus } from '../../common/constants/domain';
import { PaginationDto } from './pagination.dto';

/** Pagination plus an optional ?status= on the account. */
export class UserStatusFilterDto extends PaginationDto {
  @IsOptional()
  @IsIn(USER_STATUSES, {
    message: `status must be one of: ${USER_STATUSES.join(', ')}`,
  })
  status?: UserStatus;
}
