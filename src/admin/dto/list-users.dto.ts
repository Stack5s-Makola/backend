import { IsIn, IsOptional } from 'class-validator';
import { USER_ROLES } from '../../common/constants/domain';
import type { UserRole } from '../../common/constants/domain';
import { UserStatusFilterDto } from './status-filter';

/** Optional ?role= and ?status= filters for GET /api/admin/users. */
export class ListUsersDto extends UserStatusFilterDto {
  @IsOptional()
  @IsIn(USER_ROLES, {
    message: `role must be one of: ${USER_ROLES.join(', ')}`,
  })
  role?: UserRole;
}
