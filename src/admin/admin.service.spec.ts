import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdminService } from './admin.service';

const EMAIL = 'superadmin@example.com';
const PASSWORD = 'correct-horse-battery';

async function buildService(env: Record<string, string | undefined>) {
  const module = await Test.createTestingModule({
    providers: [
      AdminService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();

  return module.get(AdminService);
}

describe('AdminService.login', () => {
  let service: AdminService;

  beforeEach(async () => {
    service = await buildService({
      SUPER_ADMIN_EMAIL: EMAIL,
      SUPER_ADMIN_PASSWORD: PASSWORD,
    });
  });

  it('accepts the configured credentials', () => {
    expect(service.login({ email: EMAIL, password: PASSWORD })).toEqual({
      message: 'Login successful',
      data: { email: EMAIL, role: 'ADMIN' },
    });
  });

  it('rejects an unknown email with 401', () => {
    expect(() =>
      service.login({ email: 'someone@else.com', password: PASSWORD }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a wrong password with 401', () => {
    expect(() => service.login({ email: EMAIL, password: 'nope' })).toThrow(
      new UnauthorizedException('Incorrect password'),
    );
  });

  it('checks the email before the password', () => {
    expect(() =>
      service.login({ email: 'someone@else.com', password: 'nope' }),
    ).toThrow(
      new UnauthorizedException('No admin account found for that email'),
    );
  });

  it('ignores casing and spacing in the configured email', async () => {
    const lenient = await buildService({
      SUPER_ADMIN_EMAIL: `  ${EMAIL.toUpperCase()} `,
      SUPER_ADMIN_PASSWORD: PASSWORD,
    });

    expect(lenient.login({ email: EMAIL, password: PASSWORD })).toMatchObject({
      message: 'Login successful',
    });
  });

  it('is 500, not 401, when the credentials are not configured', async () => {
    const unconfigured = await buildService({});

    expect(() =>
      unconfigured.login({ email: EMAIL, password: PASSWORD }),
    ).toThrow(InternalServerErrorException);
  });
});
