import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { OtpService } from './otp.service';
import { RequestOtpDto } from './dto';

@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  /**
   * POST /api/otp — send a fresh code to an email address.
   *
   * This is the "resend" the mobile app's verification screen calls. It is
   * also what recovers an account whose registration email never arrived.
   * The code is only ever emailed; the response just says when it dies.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() body: RequestOtpDto) {
    const result = await this.otpService.issue(body.email, body.purpose);

    return {
      message: 'Verification code sent',
      data: result,
    };
  }
}
