import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { validationPipe } from '../common/validation';
import { PasswordController } from './password.controller';
import { PasswordService } from './password.service';

/** The envelope the response interceptor and exception filter both emit. */
interface Envelope {
  success: boolean;
  message: string;
  data: unknown;
  errors?: Record<string, string>;
}

const valid = {
  userId: '11111111-1111-4111-8111-111111111111',
  password: 'a-brand-new-password',
};

describe('POST /reset-password', () => {
  const reset = jest.fn();
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PasswordController],
      providers: [{ provide: PasswordService, useValue: { reset } }],
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
    reset.mockResolvedValue({
      message: 'Password changed',
      data: { reset: true },
    });
  });

  const post = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/reset-password')
      .send(body);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 and reset true on a good body', async () => {
    const { status, body } = await post(valid);

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'Password changed',
      data: { reset: true },
    });
  });

  it('404 when the account does not exist', async () => {
    reset.mockRejectedValue(
      new NotFoundException('No account found for that id'),
    );

    const { status, body } = await post(valid);

    expect(status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      message: 'No account found for that id',
      data: null,
    });
  });

  it.each([
    ['userId', { ...valid, userId: 'not-a-uuid' }],
    ['password', { ...valid, password: 'short' }],
    ['password', { ...valid, password: '' }],
  ])('400 when %s is bad', async (field, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty(field);
  });

  it('400 when the password is missing entirely', async () => {
    const withoutPassword: Record<string, unknown> = { ...valid };
    delete withoutPassword.password;

    expect((await post(withoutPassword)).status).toBe(400);
  });

  it('never echoes the new password back', async () => {
    const { body } = await post(valid);

    expect(JSON.stringify(body)).not.toContain(valid.password);
  });
});
