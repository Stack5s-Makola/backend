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
  const update = jest.fn();
  let service: VerificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    verify.mockResolvedValue(undefined);
    update.mockResolvedValue({ affected: 1 });

    const module = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: OtpService, useValue: { verify } },
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
});
