import { IsIn } from 'class-validator';
import { USER_STATUSES } from '../../common/constants/domain';
import type { UserStatus } from '../../common/constants/domain';

export class UpdateUserStatusDto {
  @IsIn(USER_STATUSES, {
    message: `status must be one of: ${USER_STATUSES.join(', ')}`,
  })
  status: UserStatus;
}
