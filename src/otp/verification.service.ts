import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { VerifyOtpDto } from './dto';
import { OtpService } from './otp.service';

@Injectable()
export class VerificationService {
  constructor(
    private readonly otp: OtpService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Spends a verification code and marks the address verified.
   *
   * OtpService.verify throws a 400 on every failure - wrong, expired, already
   * used, too many tries - each with a message the app can show as it is. So
   * reaching the line after it means the code was good.
   */
  async verifyOtp({ email, code, purpose }: VerifyOtpDto) {
    await this.otp.verify(email, code, purpose);

    // Only for email verification: a password reset or login code says
    // nothing about whether the address was ever confirmed.
    if (!purpose || purpose === 'email_verification') {
      // No row for this address is not an error. A code can be issued before
      // the account exists, and the code itself was still valid.
      await this.users.update({ email }, { emailVerified: true });
    }

    return {
      message: 'Email verified',
      data: { verified: true },
    };
  }
}
