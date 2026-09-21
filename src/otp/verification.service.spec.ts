import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { OtpService } from './otp.service';
import { VerificationService } from './verification.service';

const EMAIL = 'ama@example.com';
const CODE = '004213';

describe('VerificationService.verifyOtp', () => {
  const verify = jest.fn();
  const issue = jest.fn();
  const update = jest.fn();
  let service: VerificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    verify.mockResolvedValue(undefined);
    issue.mockResolvedValue({
      email: EMAIL,
      purpose: 'email_verification',
      expiresAt: new Date('2026-09-21T03:00:00.000Z'),
    });
    update.mockResolvedValue({ affected: 1 });

    const module = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: OtpService, useValue: { verify, issue } },
        { provide: getRepositoryToken(User), useValue: { update } },
      ],
    }).compile();

    service = module.get(VerificationService);
  });

  it('says verified when the code is right', async () => {
    await expect(
      service.verifyOtp({ email: EMAIL, code: CODE }),
    ).resolves.toEqual({
      message: 'Email verified',
      data: { verified: true },
    });
  });

  it('marks the account verified', async () => {
    await service.verifyOtp({ email: EMAIL, code: CODE });

    expect(update).toHaveBeenCalledWith(
      { email: EMAIL },
      { emailVerified: true },
    );
  });

  it('passes the code to the otp service to check', async () => {
    await service.verifyOtp({ email: EMAIL, code: CODE });

    expect(verify).toHaveBeenCalledWith(EMAIL, CODE, undefined);
  });

  it.each([
    'This verification code is incorrect',
    'This verification code has expired. Please request a new one',
    'No verification code is pending for this email address',
    'Too many incorrect attempts. Please request a new code',
  ])('passes through the rejection: %s', async (message) => {
    verify.mockRejectedValue(new BadRequestException(message));

    await expect(
      service.verifyOtp({ email: EMAIL, code: CODE }),
    ).rejects.toThrow(new BadRequestException(message));
  });

  it('never marks the account verified when the code is wrong', async () => {
    verify.mockRejectedValue(
      new BadRequestException('This verification code is incorrect'),
    );

    await expect(
      service.verifyOtp({ email: EMAIL, code: CODE }),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not mark anything verified for a password reset code', async () => {
    await service.verifyOtp({
      email: EMAIL,
      code: CODE,
      purpose: 'password_reset',
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('still succeeds when no account holds that address', async () => {
    // A code can be issued before the user row exists; the code was valid.
    update.mockResolvedValue({ affected: 0 });

    await expect(
      service.verifyOtp({ email: EMAIL, code: CODE }),
    ).resolves.toMatchObject({ data: { verified: true } });
  });

  it('resends a code and says when it dies', async () => {
    await expect(service.resend({ email: EMAIL })).resolves.toEqual({
      message: 'Verification code sent',
      data: { email: EMAIL, expiresAt: new Date('2026-09-21T03:00:00.000Z') },
    });
  });

  it('never puts the code itself in the response', async () => {
    const result = await service.resend({ email: EMAIL });

    expect(JSON.stringify(result)).not.toContain(CODE);
    expect(result.data).not.toHaveProperty('code');
  });

  it('passes the purpose through when one is given', async () => {
    await service.resend({ email: EMAIL, purpose: 'password_reset' });

    expect(issue).toHaveBeenCalledWith(EMAIL, 'password_reset');
  });

  it('passes the cooldown rejection straight through', async () => {
    issue.mockRejectedValue(
      new BadRequestException(
        'Please wait 43 seconds before requesting another code',
      ),
    );

    await expect(service.resend({ email: EMAIL })).rejects.toThrow(
      /wait 43 seconds/,
    );
  });
});
