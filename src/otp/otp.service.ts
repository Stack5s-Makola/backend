import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';
import { Otp } from './entities/Otp.entity';
import type { OtpPurpose } from './entities/Otp.entity';

/** Codes are six digits, so they can be typed on a phone keypad. */
export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
/** Wrong guesses allowed before the code is burned. */
export const OTP_MAX_ATTEMPTS = 5;
/** How long the caller must wait before asking for another code. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Issues a code and emails it.
   *
   * Any code still outstanding for the same address and purpose is consumed
   * first, so only the newest one ever works. Returns when the code was
   * issued and when it expires; the code itself is only ever emailed, never
   * returned, so a caller cannot leak it into a response body.
   */
  async issue(email: string, purpose: OtpPurpose = 'email_verification') {
    const address = email.trim().toLowerCase();
    await this.assertNotThrottled(address, purpose);

    // One live code per address and purpose
    await this.otpRepository.update(
      { email: address, purpose, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    await this.otpRepository.save(
      this.otpRepository.create({
        email: address,
        codeHash: await bcrypt.hash(code, 10),
        purpose,
        expiresAt,
        consumedAt: null,
        attempts: 0,
      }),
    );

    await this.emailService.sendOtpEmail(address, code, OTP_TTL_MINUTES);

    return { email: address, purpose, expiresAt };
  }

  /**
   * Checks a code and spends it.
   *
   * Throws on every failure — expired, wrong, already used, too many tries —
   * with the same 400 and a message the mobile app can show as-is. A wrong
   * guess counts against the code, so it cannot be brute forced within its
   * ten minute life.
   */
  async verify(
    email: string,
    code: string,
    purpose: OtpPurpose = 'email_verification',
  ): Promise<void> {
    const address = email.trim().toLowerCase();

    const otp = await this.otpRepository.findOne({
      where: { email: address, purpose, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      throw new BadRequestException(
        'No verification code is pending for this email address',
      );
    }

    if (otp.expiresAt.getTime() <= Date.now()) {
      await this.consume(otp);
      throw new BadRequestException(
        'This verification code has expired. Please request a new one',
      );
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await this.consume(otp);
      throw new BadRequestException(
        'Too many incorrect attempts. Please request a new code',
      );
    }

    if (!(await bcrypt.compare(code, otp.codeHash))) {
      otp.attempts += 1;
      await this.otpRepository.save(otp);
      throw new BadRequestException('This verification code is incorrect');
    }

    await this.consume(otp);
  }

  /** Drops spent and expired rows. Safe to call from a scheduled job. */
  async purgeExpired(): Promise<number> {
    const { affected } = await this.otpRepository.delete({
      expiresAt: LessThan(new Date()),
    });

    return affected ?? 0;
  }

  private async assertNotThrottled(email: string, purpose: OtpPurpose) {
    const latest = await this.otpRepository.findOne({
      where: { email, purpose },
      order: { createdAt: 'DESC' },
    });

    if (!latest) {
      return;
    }

    const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;

    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed);
      throw new BadRequestException(
        `Please wait ${wait} seconds before requesting another code`,
      );
    }
  }

  private consume(otp: Otp) {
    otp.consumedAt = new Date();
    return this.otpRepository.save(otp);
  }

  private generateCode(): string {
    return randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
  }
}
