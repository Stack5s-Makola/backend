import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, Matches } from 'class-validator';
import { normalisedEmail, trimmed } from '../../common/transforms';
import { OTP_PURPOSES } from '../entities/Otp.entity';
import type { OtpPurpose } from '../entities/Otp.entity';

/** Body of POST /api/auth/verify-otp. */
export class VerifyOtpDto {
  @Transform(normalisedEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @Transform(trimmed)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  @IsOptional()
  @IsIn(OTP_PURPOSES, {
    message: `purpose must be one of: ${OTP_PURPOSES.join(', ')}`,
  })
  purpose?: OtpPurpose;
}
