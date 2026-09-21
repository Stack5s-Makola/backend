import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { validationPipe } from '../common/validation';
import { VerificationService } from './verification.service';
import { VerifyOtpController } from './verify-otp.controller';

/** The envelope the response interceptor and exception filter both emit. */
interface Envelope {
  success: boolean;
  message: string;
  data: unknown;
  errors?: Record<string, string>;
}

const valid = { email: 'ama@example.com', code: '004213' };

describe('POST /verify-otp', () => {
  const verifyOtp = jest.fn();
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VerifyOtpController],
      providers: [{ provide: VerificationService, useValue: { verifyOtp } }],
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
    verifyOtp.mockResolvedValue({
      message: 'Email verified',
      data: { verified: true },
    });
  });

  const post = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/verify-otp')
      .send(body);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 and verified true on a correct code', async () => {
    const { status, body } = await post(valid);

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'Email verified',
      data: { verified: true },
    });
  });

  it('400 and the reason on a wrong code', async () => {
    verifyOtp.mockRejectedValue(
      new BadRequestException('This verification code is incorrect'),
    );

    const { status, body } = await post(valid);

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      message: 'This verification code is incorrect',
      data: null,
    });
  });

  it('400 and the reason on an expired code', async () => {
    verifyOtp.mockRejectedValue(
      new BadRequestException(
        'This verification code has expired. Please request a new one',
      ),
    );

    expect((await post(valid)).body.message).toContain('expired');
  });

  it.each([
    ['code', { ...valid, code: '12345' }],
    ['code', { ...valid, code: 'abcdef' }],
    ['email', { ...valid, email: 'not-an-email' }],
  ])('400 when %s is malformed', async (field, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty(field);
  });

  it('trims a code the keypad padded with spaces', async () => {
    await post({ ...valid, code: ' 004213 ' });

    expect(verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ code: '004213' }),
    );
  });
});
