import { IsNotEmpty, IsString } from 'class-validator';
import { UserStatusFilterDto } from './status-filter';

/** ?q= (required) and ?status= for GET /api/admin/buyers/search. */
export class SearchBuyersDto extends UserStatusFilterDto {
  @IsString()
  @IsNotEmpty({ message: 'Search term "q" is required' })
  q: string;
}
