import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { VerifyOtpDto } from './dto';
import { VerificationService } from './verification.service';

/**
 * POST /api/verify-otp - check the code that was emailed.
 *
 * Sits at the top level rather than under /otp because it completes the
 * sign-up the mobile app started at /api/register/set-seller-profile.
 */
@Controller()
export class VerifyOtpController {
  constructor(private readonly verification: VerificationService) {}

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() body: VerifyOtpDto) {
    return this.verification.verifyOtp(body);
  }
}
