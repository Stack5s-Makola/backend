import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { validationPipe } from '../common/validation';
import { LoginController } from './login.controller';
import { LoginService } from './login.service';

/** The envelope the response interceptor and exception filter both emit. */
interface Envelope {
  success: boolean;
  message: string;
  data: unknown;
  errors?: Record<string, string>;
}

const valid = { email: 'ama@example.com', password: 'correct-horse-battery' };

describe('POST /login', () => {
  const login = jest.fn();
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LoginController],
      providers: [{ provide: LoginService, useValue: { login } }],
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

  beforeEach(() => {
    jest.clearAllMocks();
    login.mockResolvedValue({
      message: 'Signed in. Check your email for a verification code.',
      data: { email: valid.email, role: 'SELLER', emailVerified: true },
    });
  });

  const post = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer()).post('/login').send(body);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 with the role on good credentials', async () => {
    const { status, body } = await post(valid);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { role: 'SELLER' },
    });
  });

  it('401 on bad credentials', async () => {
    login.mockRejectedValue(
      new UnauthorizedException('Invalid email or password'),
    );

    const { status, body } = await post(valid);

    expect(status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      message: 'Invalid email or password',
      data: null,
    });
  });

  it('403 on a suspended account', async () => {
    login.mockRejectedValue(
      new ForbiddenException(
        'This account is suspended. Please contact support',
      ),
    );

    const { status, body } = await post(valid);

    expect(status).toBe(403);
    expect(body.message).toContain('suspended');
  });

  it.each([
    ['email', { ...valid, email: 'not-an-email' }],
    ['password', { ...valid, password: '' }],
  ])('400 when %s is missing or malformed', async (field, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty(field);
  });

  it('normalises the email before the service sees it', async () => {
    await post({ ...valid, email: '  AMA@Example.COM ' });

    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ama@example.com' }),
    );
  });

  it('never echoes the password back', async () => {
    const { body } = await post(valid);

    expect(JSON.stringify(body)).not.toContain(valid.password);
  });
});
