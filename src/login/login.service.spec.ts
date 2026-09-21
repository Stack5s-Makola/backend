import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { OtpService } from '../otp/otp.service';
import { User } from '../users/entities/user.entity';
import { LoginService } from './login.service';

const EMAIL = 'ama@example.com';
const PASSWORD = 'correct-horse-battery';
const SECRET = 'test-secret';

describe('LoginService.login', () => {
  const findOne = jest.fn();
  const issue = jest.fn();
  let service: LoginService;
  let jwt: JwtService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  const account = (overrides: Partial<User> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    email: EMAIL,
    passwordHash,
    role: 'seller',
    status: 'active',
    emailVerified: true,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    findOne.mockResolvedValue(account());
    issue.mockResolvedValue({ email: EMAIL, expiresAt: new Date() });

    const module = await Test.createTestingModule({
      // No signOptions, exactly like SessionTokenModule: tokens carry no exp.
      imports: [JwtModule.register({ secret: SECRET })],
      providers: [
        LoginService,
        { provide: getRepositoryToken(User), useValue: { findOne } },
        { provide: OtpService, useValue: { issue } },
      ],
    }).compile();

    service = module.get(LoginService);
    jwt = module.get(JwtService);
  });

  it('returns the role, uppercased, on the right password', async () => {
    await expect(
      service.login({ email: EMAIL, password: PASSWORD }),
    ).resolves.toMatchObject({
      data: { email: EMAIL, role: 'SELLER', emailVerified: true },
    });
  });

  it('reports BUYER for a buyer account', async () => {
    findOne.mockResolvedValue(account({ role: 'BUYER' }));

    const { data } = await service.login({ email: EMAIL, password: PASSWORD });

    expect(data.role).toBe('BUYER');
  });

  it('sends a login code', async () => {
    await service.login({ email: EMAIL, password: PASSWORD });

    expect(issue).toHaveBeenCalledWith(EMAIL, 'login');
  });

  it('tells the caller to go and check their email', async () => {
    const { message } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });

    expect(message).toContain('verification code');
  });

  it('401s on a wrong password', async () => {
    await expect(
      service.login({ email: EMAIL, password: 'wrong' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
  });

  it('401s on an unknown email, with the same message', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.login({ email: 'nobody@example.com', password: PASSWORD }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
  });

  it('sends no code when the credentials are wrong', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.login({ email: EMAIL, password: PASSWORD }),
    ).rejects.toThrow();
    expect(issue).not.toHaveBeenCalled();
  });

  it.each(['suspended', 'deleted'])('403s on a %s account', async (status) => {
    findOne.mockResolvedValue(account({ status }));

    await expect(
      service.login({ email: EMAIL, password: PASSWORD }),
    ).rejects.toThrow(ForbiddenException);
    expect(issue).not.toHaveBeenCalled();
  });

  it('signs in an account whose email is not verified yet', async () => {
    findOne.mockResolvedValue(account({ emailVerified: false }));

    const { data } = await service.login({ email: EMAIL, password: PASSWORD });

    expect(data.emailVerified).toBe(false);
  });

  it('still signs in when the code could not be sent', async () => {
    issue.mockRejectedValue(new Error('brevo is down'));

    await expect(
      service.login({ email: EMAIL, password: PASSWORD }),
    ).resolves.toMatchObject({ data: { role: 'SELLER' } });
  });

  it('never returns the password hash', async () => {
    const result = await service.login({ email: EMAIL, password: PASSWORD });

    expect(JSON.stringify(result)).not.toContain('$2b$');
  });

  it('hands back a token that never expires', async () => {
    const { data } = await service.login({ email: EMAIL, password: PASSWORD });

    const claims = await jwt.verifyAsync<JwtPayload & { exp?: number }>(
      data.accessToken,
    );

    expect(claims).toMatchObject({
      sub: '11111111-1111-4111-8111-111111111111',
      email: EMAIL,
      role: 'SELLER',
    });
    expect(claims.exp).toBeUndefined();
  });

  it('issues no token when the credentials are wrong', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.login({ email: EMAIL, password: PASSWORD }),
    ).rejects.toThrow();
  });

  it('treats an unrecognised role as a buyer', async () => {
    findOne.mockResolvedValue(account({ role: 'something-else' }));

    const { data } = await service.login({ email: EMAIL, password: PASSWORD });

    expect(data.role).toBe('BUYER');
  });
});
