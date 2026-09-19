import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';
import { Otp } from './entities/Otp.entity';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OtpService,
} from './otp.service';

/** Typed stand-ins for jest's matchers, which are otherwise `any`. */
const ANY_DATE = expect.any(Date) as unknown as Date;
const containing = <T>(shape: Partial<T>): T => {
  const matcher: unknown = expect.objectContaining(shape);
  return matcher as T;
};

/** The first argument a mock was called with, typed. */
const firstArg = <T>(mock: jest.Mock, call = 0): T =>
  (mock.mock.calls as T[][])[call][0];

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

const makeOtp = (overrides: Partial<Otp> = {}): Otp => ({
  id: 'o1',
  email: 'buyer@example.com',
  codeHash: bcrypt.hashSync('123456', 4),
  purpose: 'email_verification',
  expiresAt: new Date(Date.now() + 5 * 60_000),
  consumedAt: null,
  attempts: 0,
  createdAt: minutesAgo(1),
  ...overrides,
});

describe('OtpService', () => {
  let repo: MockRepo;
  let email: { sendOtpEmail: jest.Mock };
  let service: OtpService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input: Partial<Otp>) => input as Otp),
      save: jest.fn((input: Partial<Otp>) => Promise.resolve(input as Otp)),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      delete: jest.fn().mockResolvedValue({ affected: 3 }),
    };
    email = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) };

    service = new OtpService(repo as never, email as unknown as EmailService);
  });

  describe('issue', () => {
    it('emails a six digit code and never returns it', async () => {
      const result = await service.issue('Buyer@Example.com ');

      const to = firstArg<string>(email.sendOtpEmail);
      const code = (email.sendOtpEmail.mock.calls as string[][])[0][1];
      expect(to).toBe('buyer@example.com');
      expect(code).toMatch(/^\d{6}$/);
      expect(JSON.stringify(result)).not.toContain(code);
    });

    it('stores a hash of the code, not the code', async () => {
      await service.issue('buyer@example.com');

      const code = (email.sendOtpEmail.mock.calls as string[][])[0][1];
      const saved = firstArg<Otp>(repo.create);

      expect(saved.codeHash).not.toBe(code);
      expect(await bcrypt.compare(code, saved.codeHash)).toBe(true);
    });

    it('consumes any code still outstanding for the address', async () => {
      await service.issue('buyer@example.com');

      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'buyer@example.com' }),
        containing<Otp>({ consumedAt: ANY_DATE }),
      );
    });

    it('refuses a resend inside the cooldown', async () => {
      repo.findOne.mockResolvedValue(makeOtp({ createdAt: new Date() }));

      await expect(service.issue('buyer@example.com')).rejects.toThrow(
        BadRequestException,
      );
      expect(email.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('allows a resend once the cooldown has passed', async () => {
      repo.findOne.mockResolvedValue(
        makeOtp({
          createdAt: new Date(
            Date.now() - (OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000,
          ),
        }),
      );

      await expect(service.issue('buyer@example.com')).resolves.toBeDefined();
      expect(email.sendOtpEmail).toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('accepts the right code and spends it', async () => {
      const otp = makeOtp();
      repo.findOne.mockResolvedValue(otp);

      await expect(
        service.verify('buyer@example.com', '123456'),
      ).resolves.toBeUndefined();
      expect(repo.save).toHaveBeenCalledWith(
        containing<Otp>({ consumedAt: ANY_DATE }),
      );
    });

    it('counts a wrong guess against the code', async () => {
      const otp = makeOtp();
      repo.findOne.mockResolvedValue(otp);

      await expect(
        service.verify('buyer@example.com', '000000'),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).toHaveBeenCalledWith(
        containing<Otp>({ attempts: 1, consumedAt: null }),
      );
    });

    it('burns a code that has run out of attempts', async () => {
      repo.findOne.mockResolvedValue(makeOtp({ attempts: OTP_MAX_ATTEMPTS }));

      await expect(
        service.verify('buyer@example.com', '123456'),
      ).rejects.toThrow(/Too many incorrect attempts/);
      expect(repo.save).toHaveBeenCalledWith(
        containing<Otp>({ consumedAt: ANY_DATE }),
      );
    });

    it('rejects an expired code', async () => {
      repo.findOne.mockResolvedValue(makeOtp({ expiresAt: minutesAgo(1) }));

      await expect(
        service.verify('buyer@example.com', '123456'),
      ).rejects.toThrow(/expired/);
    });

    it('rejects when no code is pending', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.verify('buyer@example.com', '123456'),
      ).rejects.toThrow(/No verification code is pending/);
    });

    it('only looks at unconsumed codes for the matching purpose', async () => {
      repo.findOne.mockResolvedValue(makeOtp());

      await service.verify('buyer@example.com', '123456', 'password_reset');

      expect(
        firstArg<{ where: { purpose: string } }>(repo.findOne).where,
      ).toMatchObject({ purpose: 'password_reset' });
    });
  });

  it('purges expired rows', async () => {
    await expect(service.purgeExpired()).resolves.toBe(3);
  });
});
