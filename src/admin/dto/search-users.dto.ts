import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { USER_ROLES } from '../../common/constants/domain';
import type { UserRole } from '../../common/constants/domain';
import { PaginationDto } from './pagination.dto';

/** ?q= plus optional ?role=, for GET /api/admin/users/search. */
export class SearchUsersDto extends PaginationDto {
  @IsString()
  @IsNotEmpty({ message: 'Search term "q" is required' })
  q: string;

  @IsOptional()
  @IsIn(USER_ROLES, {
    message: `role must be one of: ${USER_ROLES.join(', ')}`,
  })
  role?: UserRole;
}
