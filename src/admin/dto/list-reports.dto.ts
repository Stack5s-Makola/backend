import { IsIn, IsOptional } from 'class-validator';
import type { ReportStatus } from '../../common/constants/domain';
import { PaginationDto } from './pagination.dto';

const REPORT_STATUSES: ReportStatus[] = [
  'pending',
  'reviewed',
  'resolved',
  'dismissed',
];

/** Optional ?status= filter, so the Admin Web can show just the open queue. */
export class ListReportsDto extends PaginationDto {
  @IsOptional()
  @IsIn(REPORT_STATUSES, {
    message: `status must be one of: ${REPORT_STATUSES.join(', ')}`,
  })
  status?: ReportStatus;
}
