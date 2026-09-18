import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional note sent with a reject or remove, shown back to the seller. */
export class ModerationReasonDto {
  @IsOptional()
  @IsString({ message: 'reason must be text' })
  @MaxLength(500, { message: 'reason cannot exceed 500 characters' })
  reason?: string;
}
