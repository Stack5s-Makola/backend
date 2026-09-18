import { IsIn, IsOptional } from 'class-validator';
import { USER_ROLES } from '../../common/constants/domain';
import type { UserRole } from '../../common/constants/domain';
import { PaginationDto } from './pagination.dto';

/** Optional ?role= filter, so the Admin Web can list buyers and sellers apart. */
export class ListUsersDto extends PaginationDto {
  @IsOptional()
  @IsIn(USER_ROLES, {
    message: `role must be one of: ${USER_ROLES.join(', ')}`,
  })
  role?: UserRole;
}
