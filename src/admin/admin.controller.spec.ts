import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { BuyersService } from './buyers.service';
import { DashboardService } from './dashboard.service';
import { ListingsService } from './listings.service';
import { SellersService } from './sellers.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { validationPipe } from '../common/validation';

/** The envelope the response interceptor and exception filter both emit. */
interface Envelope {
  success: boolean;
  message: string;
  data: unknown;
  errors?: Record<string, string>;
}

const EMAIL = 'superadmin@example.com';
const PASSWORD = 'correct-horse-battery';
const SECRET = 'test-secret';

/**
 * Drives POST /admin/login over HTTP with the same pipe, interceptor and
 * filter main.ts installs, so the status codes here are the ones a client
 * actually sees.
 */
describe('POST /admin/login', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const env: Record<string, string> = {
      SUPER_ADMIN_EMAIL: EMAIL,
      SUPER_ADMIN_PASSWORD: PASSWORD,
      JWT_SECRET: SECRET,
    };

    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [AdminController],
      providers: [
        AdminService,
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
        // The dashboard has its own spec; the controller just needs it to exist.
        { provide: DashboardService, useValue: { totals: jest.fn() } },
        { provide: SellersService, useValue: { list: jest.fn() } },
        { provide: BuyersService, useValue: { list: jest.fn() } },
        { provide: ListingsService, useValue: { list: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(validationPipe);
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/admin/login')
      .send(body);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 on the right credentials', async () => {
    const { status, body } = await login({ email: EMAIL, password: PASSWORD });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message: 'Login successful',
      data: { admin: { email: EMAIL, role: 'ADMIN' } },
    });
  });

  it('returns a bearer token in the body', async () => {
    const { body } = await login({ email: EMAIL, password: PASSWORD });
    const { accessToken } = body.data as { accessToken: string };

    // header.payload.signature
    expect(accessToken.split('.')).toHaveLength(3);
  });

  it('200 when the email arrives upper-cased or padded', async () => {
    const { status } = await login({
      email: `  ${EMAIL.toUpperCase()} `,
      password: PASSWORD,
    });

    expect(status).toBe(200);
  });

  it('401 on an unknown email', async () => {
    const { status, body } = await login({
      email: 'someone@else.com',
      password: PASSWORD,
    });

    expect(status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      message: 'No admin account found for that email',
      data: null,
    });
  });

  it('401 on a wrong password', async () => {
    const { status, body } = await login({ email: EMAIL, password: 'nope' });

    expect(status).toBe(401);
    expect(body).toMatchObject({ message: 'Incorrect password' });
  });

  it('400 with a field map when the email is malformed', async () => {
    const { status, body } = await login({
      email: 'not-an-email',
      password: PASSWORD,
    });

    expect(status).toBe(400);
    expect(body.message).toBe('Validation failed');
    expect(body.errors?.email).toBe('Please provide a valid email address');
  });

  it('400 when the password is missing', async () => {
    const { status, body } = await login({ email: EMAIL });

    expect(status).toBe(400);
    expect(body.errors?.password).toBe('Password is required');
  });
});
