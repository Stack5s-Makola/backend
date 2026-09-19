import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional } from 'class-validator';
import { normalisedEmail } from '../../common/transforms';
import { OTP_PURPOSES } from '../entities/Otp.entity';
import type { OtpPurpose } from '../entities/Otp.entity';

/** Body of POST /api/otp — ask for a code, or resend the last one. */
export class RequestOtpDto {
  @Transform(normalisedEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsOptional()
  @IsIn(OTP_PURPOSES, {
    message: `purpose must be one of: ${OTP_PURPOSES.join(', ')}`,
  })
  purpose?: OtpPurpose;
}
