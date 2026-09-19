import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { trimmed } from '../../common/transforms';

/** Body of POST /api/auth/refresh and POST /api/auth/logout. */
export class RefreshTokenDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'refreshToken is required' })
  refreshToken!: string;
}
