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
  const resend = jest.fn();
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VerifyOtpController],
      providers: [
        { provide: VerificationService, useValue: { verifyOtp, resend } },
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

  beforeEach(() => {
    jest.clearAllMocks();
    verifyOtp.mockResolvedValue({
      message: 'Email verified',
      data: { verified: true },
    });
    resend.mockResolvedValue({
      message: 'Verification code sent',
      data: { email: valid.email, expiresAt: '2026-09-21T03:00:00.000Z' },
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

  const postResend = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/verify-otp/resend')
      .send(body);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 on resend, with the new expiry', async () => {
    const { status, body } = await postResend({ email: valid.email });

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'Verification code sent',
      data: { email: valid.email, expiresAt: '2026-09-21T03:00:00.000Z' },
    });
  });

  it('resend needs no code in the body', async () => {
    expect((await postResend({ email: valid.email })).status).toBe(200);
  });

  it('400 when resend gets a bad email', async () => {
    const { status, body } = await postResend({ email: 'not-an-email' });

    expect(status).toBe(400);
    expect(body.errors).toHaveProperty('email');
  });

  it('400 with the wait when resend is throttled', async () => {
    resend.mockRejectedValue(
      new BadRequestException(
        'Please wait 43 seconds before requesting another code',
      ),
    );

    const { status, body } = await postResend({ email: valid.email });

    expect(status).toBe(400);
    expect(body.message).toContain('43 seconds');
  });
});
