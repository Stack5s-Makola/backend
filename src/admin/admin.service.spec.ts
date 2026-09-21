import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { AdminService, SUPER_ADMIN_ID } from './admin.service';

const EMAIL = 'superadmin@example.com';
const PASSWORD = 'correct-horse-battery';
const SECRET = 'test-secret';

async function buildService(env: Record<string, string | undefined>) {
  const module = await Test.createTestingModule({
    imports: [
      JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '15m' } }),
    ],
    providers: [
      AdminService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();

  return {
    service: module.get(AdminService),
    jwt: module.get(JwtService),
  };
}

describe('AdminService.login', () => {
  let service: AdminService;
  let jwt: JwtService;

  beforeEach(async () => {
    ({ service, jwt } = await buildService({
      SUPER_ADMIN_EMAIL: EMAIL,
      SUPER_ADMIN_PASSWORD: PASSWORD,
      JWT_SECRET: SECRET,
    }));
  });

  it('issues an access token the guards can verify', async () => {
    const { data } = await service.login({ email: EMAIL, password: PASSWORD });

    const claims = await jwt.verifyAsync<JwtPayload>(data.accessToken);

    expect(claims).toMatchObject({
      sub: SUPER_ADMIN_ID,
      email: EMAIL,
      role: 'ADMIN',
    });
  });

  it('returns the admin alongside the token', async () => {
    const { message, data } = await service.login({
      email: EMAIL,
      password: PASSWORD,
    });

    expect(message).toBe('Login successful');
    expect(data.admin).toEqual({ email: EMAIL, role: 'ADMIN' });
    expect(typeof data.accessToken).toBe('string');
  });

  it('gives the token an expiry', async () => {
    const { data } = await service.login({ email: EMAIL, password: PASSWORD });

    const { exp, iat } = await jwt.verifyAsync<
      JwtPayload & {
        exp: number;
        iat: number;
      }
    >(data.accessToken);

    expect(exp - iat).toBe(15 * 60);
  });

  it('rejects an unknown email with 401', async () => {
    await expect(
      service.login({ email: 'someone@else.com', password: PASSWORD }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong password with 401', async () => {
    await expect(
      service.login({ email: EMAIL, password: 'nope' }),
    ).rejects.toThrow(new UnauthorizedException('Incorrect password'));
  });

  it('checks the email before the password', async () => {
    await expect(
      service.login({ email: 'someone@else.com', password: 'nope' }),
    ).rejects.toThrow(
      new UnauthorizedException('No admin account found for that email'),
    );
  });

  it('ignores casing and spacing in the configured email', async () => {
    const { service: lenient } = await buildService({
      SUPER_ADMIN_EMAIL: `  ${EMAIL.toUpperCase()} `,
      SUPER_ADMIN_PASSWORD: PASSWORD,
      JWT_SECRET: SECRET,
    });

    await expect(
      lenient.login({ email: EMAIL, password: PASSWORD }),
    ).resolves.toMatchObject({ message: 'Login successful' });
  });

  it('is 500, not 401, when the credentials are not configured', async () => {
    const { service: unconfigured } = await buildService({
      JWT_SECRET: SECRET,
    });

    await expect(
      unconfigured.login({ email: EMAIL, password: PASSWORD }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('is 500 when JWT_SECRET is missing, before any credential check', async () => {
    const { service: unsigned } = await buildService({
      SUPER_ADMIN_EMAIL: EMAIL,
      SUPER_ADMIN_PASSWORD: PASSWORD,
    });

    await expect(
      unsigned.login({ email: 'wrong@example.com', password: 'wrong' }),
    ).rejects.toThrow(
      new InternalServerErrorException('JWT_SECRET is not configured'),
    );
  });
});
