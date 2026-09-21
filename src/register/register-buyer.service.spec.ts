import { ConflictException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { OtpService } from '../otp/otp.service';
import { RegisterBuyerDto } from './dto';
import { RegisterService } from './register.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECRET = 'test-secret';

const body: RegisterBuyerDto = {
  email: 'kofi@example.com',
  phone: '0241234567',
  password: 'correct-horse',
  role: 'BUYER',
};

describe('RegisterService.registerBuyer', () => {
  const findOne = jest.fn();
  const insert = jest.fn();
  const issue = jest.fn();
  let service: RegisterService;
  let jwt: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Nothing taken by default.
    findOne.mockResolvedValue(null);
    insert.mockResolvedValue({ identifiers: [{ id: USER_ID }] });
    issue.mockResolvedValue({ email: body.email, expiresAt: new Date() });

    const module = await Test.createTestingModule({
      // No signOptions, exactly like SessionTokenModule: tokens carry no exp.
      imports: [JwtModule.register({ secret: SECRET })],
      providers: [
        RegisterService,
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: jest.fn(),
            getRepository: () => ({ findOne, insert }),
          },
        },
        { provide: OtpService, useValue: { issue } },
      ],
    }).compile();

    service = module.get(RegisterService);
    jwt = module.get(JwtService);
  });

  it('says yes once the account is written', async () => {
    await expect(service.registerBuyer(body)).resolves.toMatchObject({
      data: { saved: true },
    });
  });

  it('writes the account with its email, phone and role', async () => {
    await service.registerBuyer(body);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'kofi@example.com',
        phone: '0241234567',
        role: 'BUYER',
      }),
    );
  });

  it('stores a bcrypt hash, never the password', async () => {
    await service.registerBuyer(body);

    const [values] = insert.mock.calls[0] as [{ passwordHash: string }];

    expect(values.passwordHash).not.toBe(body.password);
    await expect(
      bcrypt.compare(body.password, values.passwordHash),
    ).resolves.toBe(true);
  });

  it('creates no shop row', async () => {
    await service.registerBuyer(body);

    const [values] = insert.mock.calls[0] as [Record<string, unknown>];

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).not.toHaveProperty('shopName');
  });

  it('emails a verification code', async () => {
    await service.registerBuyer(body);

    expect(issue).toHaveBeenCalledWith(body.email, 'email_verification');
  });

  it('tells the caller to go and check their email', async () => {
    const { message } = await service.registerBuyer(body);

    expect(message).toContain('verification code');
  });

  it('409s when the email is taken, before writing anything', async () => {
    findOne.mockImplementation(({ where }: { where: { email?: string } }) =>
      where.email ? { id: 'someone' } : null,
    );

    await expect(service.registerBuyer(body)).rejects.toThrow(
      new ConflictException('An account with that email already exists'),
    );
    expect(insert).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('409s when the phone is taken', async () => {
    findOne.mockImplementation(({ where }: { where: { phone?: string } }) =>
      where.phone ? { id: 'someone' } : null,
    );

    await expect(service.registerBuyer(body)).rejects.toThrow(
      new ConflictException('An account with that phone number already exists'),
    );
  });

  it('turns a raced email collision into a 409', async () => {
    insert.mockRejectedValue(
      Object.assign(
        new QueryFailedError('insert', [], new Error('duplicate key')),
        {
          driverError: {
            code: '23505',
            detail: 'Key (email)=(kofi@example.com) already exists.',
          },
        },
      ),
    );

    await expect(service.registerBuyer(body)).rejects.toThrow(
      new ConflictException('An account with that email already exists'),
    );
  });

  it('hands back a token that never expires', async () => {
    const { data } = await service.registerBuyer(body);

    const claims = await jwt.verifyAsync<JwtPayload & { exp?: number }>(
      data.accessToken,
    );

    expect(claims).toMatchObject({
      sub: USER_ID,
      email: body.email,
      role: 'BUYER',
    });
    expect(claims.exp).toBeUndefined();
  });

  it('reports the account as unverified', async () => {
    const { data } = await service.registerBuyer(body);

    expect(data.user).toEqual({
      id: USER_ID,
      email: body.email,
      role: 'BUYER',
      emailVerified: false,
    });
  });

  it('still succeeds when the code could not be sent', async () => {
    issue.mockRejectedValue(new Error('brevo is down'));

    await expect(service.registerBuyer(body)).resolves.toMatchObject({
      data: { saved: true },
    });
  });

  it('accepts SELLER too, without creating a shop', async () => {
    await service.registerBuyer({ ...body, role: 'SELLER' });

    const [values] = insert.mock.calls[0] as [{ role: string }];

    expect(values.role).toBe('SELLER');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('never puts the password in the response', async () => {
    const result = await service.registerBuyer(body);

    expect(JSON.stringify(result)).not.toContain(body.password);
    expect(JSON.stringify(result)).not.toContain('$2b$');
  });
});
