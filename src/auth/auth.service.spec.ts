import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { OtpService } from '../otp/otp.service';
import { RefreshToken } from './entities/RefreshTokens.entity';

type MockRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

/** The first argument a mock was called with, typed. */
const firstArg = <T>(mock: jest.Mock, call = 0): T =>
  (mock.mock.calls as T[][])[call][0];

const PASSWORD = 'correct-horse';
const REFRESH = 'a'.repeat(64);
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const makeRefresh = (overrides: Partial<RefreshToken> = {}): RefreshToken => ({
  id: 'r1',
  userId: 'u1',
  tokenHash: sha256(REFRESH),
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  replacedBy: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'buyer@example.com',
  phone: '0241234567',
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
  role: 'BUYER',
  status: 'active',
  emailVerified: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

describe('AuthService', () => {
  let users: MockRepo;
  let refresh: MockRepo & { update: jest.Mock; delete: jest.Mock };
  let otp: { issue: jest.Mock; verify: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    users = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input: Partial<User>) => input as User),
      save: jest.fn((input: Partial<User>) =>
        Promise.resolve({ ...makeUser(), ...input }),
      ),
    };
    refresh = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input: Partial<RefreshToken>) => input as RefreshToken),
      save: jest.fn((input: Partial<RefreshToken>) =>
        Promise.resolve({ id: 'r-new', ...input } as RefreshToken),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    otp = {
      issue: jest
        .fn()
        .mockResolvedValue({ expiresAt: new Date('2026-01-01T00:10:00Z') }),
      verify: jest.fn().mockResolvedValue(undefined),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    service = new AuthService(
      users as never,
      refresh as never,
      otp as unknown as OtpService,
      jwt as never,
      { get: () => '15m' } as never,
    );
  });

  describe('register', () => {
    const body = {
      email: 'new@example.com',
      phone: '0241234567',
      password: 'longenough',
    };

    it('hashes the password instead of storing it', async () => {
      await service.register(body);

      const saved = firstArg<User>(users.create);
      expect(saved.passwordHash).not.toBe(body.password);
      expect(await bcrypt.compare(body.password, saved.passwordHash)).toBe(
        true,
      );
    });

    it('creates the account unverified and sends a code', async () => {
      const result = await service.register(body);

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerified: false, role: 'BUYER' }),
      );
      expect(otp.issue).toHaveBeenCalledWith(
        'new@example.com',
        'email_verification',
      );
      expect(result.data.verification.required).toBe(true);
    });

    it('never returns the password hash', async () => {
      const result = await service.register(body);
      expect(result.data.user).not.toHaveProperty('passwordHash');
    });

    it('rejects an email that is already taken', async () => {
      users.find.mockResolvedValue([makeUser({ email: body.email })]);
      await expect(service.register(body)).rejects.toThrow(
        /email already exists/,
      );
    });

    it('rejects a phone number that is already taken', async () => {
      users.find.mockResolvedValue([makeUser({ phone: body.phone })]);
      await expect(service.register(body)).rejects.toThrow(
        /phone number already exists/,
      );
    });

    it('stores the phone number on the account', async () => {
      await service.register(body);
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ phone: body.phone }),
      );
    });

    it('honours a requested SELLER role', async () => {
      await service.register({ ...body, role: 'SELLER' });
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'SELLER' }),
      );
    });
  });

  describe('login', () => {
    const body = { email: 'buyer@example.com', password: PASSWORD };

    it('returns a token for the right password', async () => {
      users.findOne.mockResolvedValue(makeUser());

      const result = await service.login(body);

      expect(result.data.accessToken).toBe('signed.jwt.token');
      expect(result.data.user).not.toHaveProperty('passwordHash');
    });

    it('issues a refresh token and stores only its digest', async () => {
      users.findOne.mockResolvedValue(makeUser());

      const result = await service.login(body);
      const stored = firstArg<RefreshToken>(refresh.create);

      expect(result.data.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.tokenHash).toBe(sha256(result.data.refreshToken));
      expect(stored.tokenHash).not.toBe(result.data.refreshToken);
    });

    it('does not leak the internal refresh row id', async () => {
      users.findOne.mockResolvedValue(makeUser());

      const result = await service.login(body);

      expect(result.data).not.toHaveProperty('refreshTokenId');
    });

    it('puts the uppercase role on the token', async () => {
      users.findOne.mockResolvedValue(makeUser({ role: 'seller' }));

      await service.login(body);

      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'u1', role: 'SELLER' }),
      );
    });

    it('rejects a wrong password', async () => {
      users.findOne.mockResolvedValue(makeUser());
      await expect(
        service.login({ ...body, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('gives an unknown email the same answer as a wrong password', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.login(body)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unverified account with a code the app can read', async () => {
      users.findOne.mockResolvedValue(makeUser({ emailVerified: false }));

      await expect(service.login(body)).rejects.toMatchObject({
        response: { errors: { code: 'EMAIL_NOT_VERIFIED' } },
      });
    });

    it('rejects a suspended account', async () => {
      users.findOne.mockResolvedValue(makeUser({ status: 'suspended' }));
      await expect(service.login(body)).rejects.toThrow(ForbiddenException);
    });

    it('treats a deleted account as unknown', async () => {
      users.findOne.mockResolvedValue(makeUser({ status: 'deleted' }));
      await expect(service.login(body)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyOtp', () => {
    const body = { email: 'buyer@example.com', code: '123456' };

    it('marks the email verified and signs the user in', async () => {
      users.findOne.mockResolvedValue(makeUser({ emailVerified: false }));

      const result = await service.verifyOtp(body);

      expect(otp.verify).toHaveBeenCalledWith(
        body.email,
        body.code,
        'email_verification',
      );
      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerified: true }),
      );
      expect(result.data.accessToken).toBe('signed.jwt.token');
    });

    it('does not verify a code for an account that does not exist', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(service.verifyOtp(body)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(otp.verify).not.toHaveBeenCalled();
    });

    it('leaves the account unverified when the code is wrong', async () => {
      users.findOne.mockResolvedValue(makeUser({ emailVerified: false }));
      otp.verify.mockRejectedValue(new Error('bad code'));

      await expect(service.verifyOtp(body)).rejects.toThrow();
      expect(users.save).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const body = { refreshToken: REFRESH };

    it('returns a new pair and rotates the old token', async () => {
      refresh.findOne.mockResolvedValue(makeRefresh());
      users.findOne.mockResolvedValue(makeUser());

      const result = await service.refresh(body);

      expect(result.data.accessToken).toBe('signed.jwt.token');
      expect(result.data.refreshToken).not.toBe(REFRESH);

      const rotated = firstArg<RefreshToken>(refresh.save, 1);
      expect(rotated.revokedAt).toBeInstanceOf(Date);
      expect(rotated.replacedBy).toBe('r-new');
    });

    it('looks the token up by its digest, never the token itself', async () => {
      refresh.findOne.mockResolvedValue(makeRefresh());
      users.findOne.mockResolvedValue(makeUser());

      await service.refresh(body);

      expect(
        firstArg<{ where: { tokenHash: string } }>(refresh.findOne).where,
      ).toEqual({ tokenHash: sha256(REFRESH) });
    });

    it('rejects a token it has never seen', async () => {
      refresh.findOne.mockResolvedValue(null);
      await expect(service.refresh(body)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      refresh.findOne.mockResolvedValue(
        makeRefresh({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.refresh(body)).rejects.toThrow(/expired/);
    });

    it('revokes every session when a spent token is replayed', async () => {
      refresh.findOne.mockResolvedValue(
        makeRefresh({ revokedAt: new Date(), replacedBy: 'r2' }),
      );

      await expect(service.refresh(body)).rejects.toThrow(/sign in again/);
      expect(refresh.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) as Date }),
      );
    });

    it('refuses to refresh a suspended account', async () => {
      refresh.findOne.mockResolvedValue(makeRefresh());
      users.findOne.mockResolvedValue(makeUser({ status: 'suspended' }));

      await expect(service.refresh(body)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('logout', () => {
    it('revokes the presented token', async () => {
      await service.logout({ refreshToken: REFRESH });

      expect(refresh.update).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: sha256(REFRESH) }),
        expect.objectContaining({ revokedAt: expect.any(Date) as Date }),
      );
    });

    it('succeeds even for a token the server does not know', async () => {
      refresh.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.logout({ refreshToken: 'whatever' }),
      ).resolves.toMatchObject({ message: 'Signed out' });
    });
  });
});
