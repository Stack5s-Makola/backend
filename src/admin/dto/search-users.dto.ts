import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { USER_ROLES } from '../../common/constants/domain';
import type { UserRole } from '../../common/constants/domain';
import { UserStatusFilterDto } from './status-filter';

/** ?q= is required; ?role= and ?status= narrow it. */
export class SearchUsersDto extends UserStatusFilterDto {
  @IsString()
  @IsNotEmpty({ message: 'Search term "q" is required' })
  q: string;

  @IsOptional()
  @IsIn(USER_ROLES, {
    message: `role must be one of: ${USER_ROLES.join(', ')}`,
  })
  role?: UserRole;
}
