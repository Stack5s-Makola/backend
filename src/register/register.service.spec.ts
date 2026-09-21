import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { OtpService } from '../otp/otp.service';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { SetSellerProfileDto } from './dto';
import { RegisterService } from './register.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECRET = 'test-secret';

const body: SetSellerProfileDto = {
  email: 'ama@example.com',
  phone: '0241234567',
  password: 'correct-horse',
  name: 'Ama Mensah',
  shopName: 'Makola Fabrics',
  location: { latitude: 5.55, longitude: -0.2 },
  role: 'SELLER',
};

function uniqueViolation(detail: string) {
  return Object.assign(
    new QueryFailedError('insert', [], new Error('duplicate key')),
    { driverError: { code: '23505', detail } },
  );
}

describe('RegisterService.setSellerProfile', () => {
  const findOne = jest.fn();
  const insert = jest.fn();
  const transaction = jest.fn();
  const issue = jest.fn();
  let service: RegisterService;
  let jwt: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Nothing taken by default.
    findOne.mockResolvedValue(null);
    insert.mockResolvedValue({ identifiers: [{ id: USER_ID }] });
    transaction.mockImplementation((run: (m: unknown) => Promise<unknown>) =>
      run({ insert }),
    );
    issue.mockResolvedValue({ email: body.email, expiresAt: new Date() });

    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        RegisterService,
        {
          provide: ConfigService,
          useValue: { get: () => '15m' },
        },
        {
          provide: getDataSourceToken(),
          useValue: { transaction, getRepository: () => ({ findOne }) },
        },
        { provide: OtpService, useValue: { issue } },
      ],
    }).compile();

    service = module.get(RegisterService);
    jwt = module.get(JwtService);
  });

  it('says yes once the account and shop are written', async () => {
    await expect(service.setSellerProfile(body)).resolves.toMatchObject({
      data: { saved: true },
    });
  });

  it('tells the caller to go and check their email', async () => {
    const { message } = await service.setSellerProfile(body);

    expect(message).toContain('verification code');
  });

  it('issues a verification code for the new address', async () => {
    await service.setSellerProfile(body);

    expect(issue).toHaveBeenCalledWith(body.email, 'email_verification');
  });

  it('issues the code only after the writes commit', async () => {
    const order: string[] = [];

    transaction.mockImplementation(
      async (run: (m: unknown) => Promise<unknown>) => {
        await run({ insert });
        order.push('commit');
      },
    );
    issue.mockImplementation(() => {
      order.push('issue');
      return Promise.resolve({});
    });

    await service.setSellerProfile(body);

    expect(order).toEqual(['commit', 'issue']);
  });

  it('still says yes when the code could not be sent', async () => {
    // The account exists by then; failing here would send the client back to
    // retry and collect a 409 on its own email.
    issue.mockRejectedValue(new Error('brevo is down'));

    await expect(service.setSellerProfile(body)).resolves.toMatchObject({
      data: { saved: true },
    });
  });

  it('does not issue a code when the writes failed', async () => {
    insert.mockRejectedValue(new Error('connection lost'));

    await expect(service.setSellerProfile(body)).rejects.toThrow();
    expect(issue).not.toHaveBeenCalled();
  });

  it('stores a bcrypt hash, never the password', async () => {
    await service.setSellerProfile(body);

    const [, values] = insert.mock.calls[0] as [
      unknown,
      { passwordHash: string },
    ];

    expect(values.passwordHash).not.toBe(body.password);
    expect(values.passwordHash).toMatch(/^\$2[aby]\$/);
    await expect(
      bcrypt.compare(body.password, values.passwordHash),
    ).resolves.toBe(true);
  });

  it('writes the account with its email, phone and role', async () => {
    await service.setSellerProfile(body);

    expect(insert).toHaveBeenNthCalledWith(
      1,
      User,
      expect.objectContaining({
        email: 'ama@example.com',
        phone: '0241234567',
        role: 'SELLER',
      }),
    );
  });

  it('writes the shop against the new account id', async () => {
    await service.setSellerProfile(body);

    expect(insert).toHaveBeenNthCalledWith(2, Seller, {
      userId: USER_ID,
      shopName: 'Makola Fabrics',
      latitude: 5.55,
      longitude: -0.2,
    });
  });

  it('does both writes in one transaction', async () => {
    await service.setSellerProfile(body);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('409s when the email is taken, before writing anything', async () => {
    findOne.mockImplementation(({ where }: { where: { email?: string } }) =>
      where.email ? { id: 'someone' } : null,
    );

    await expect(service.setSellerProfile(body)).rejects.toThrow(
      new ConflictException('An account with that email already exists'),
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('409s when the phone is taken', async () => {
    findOne.mockImplementation(({ where }: { where: { phone?: string } }) =>
      where.phone ? { id: 'someone' } : null,
    );

    await expect(service.setSellerProfile(body)).rejects.toThrow(
      new ConflictException('An account with that phone number already exists'),
    );
  });

  it('409s when the shop name is taken', async () => {
    findOne.mockImplementation(({ where }: { where: { shopName?: string } }) =>
      where.shopName ? { id: 'someone' } : null,
    );

    await expect(service.setSellerProfile(body)).rejects.toThrow(
      new ConflictException('That shop name is already taken'),
    );
  });

  it.each([
    [
      'email',
      'Key (email)=(ama@example.com) already exists.',
      'An account with that email already exists',
    ],
    [
      'phone',
      'Key (phone)=(0241234567) already exists.',
      'An account with that phone number already exists',
    ],
    [
      'shopName',
      'Key (shopName)=(Makola Fabrics) already exists.',
      'That shop name is already taken',
    ],
  ])(
    'turns a raced %s collision into a 409',
    async (_field, detail, message) => {
      insert.mockRejectedValue(uniqueViolation(detail));

      await expect(service.setSellerProfile(body)).rejects.toThrow(
        new ConflictException(message),
      );
    },
  );

  it('lets an unexpected database failure through, so saved is never claimed', async () => {
    insert.mockRejectedValue(new Error('connection lost'));

    await expect(service.setSellerProfile(body)).rejects.toThrow(
      'connection lost',
    );
  });

  it('hands back an access token for the new account', async () => {
    const { data } = await service.setSellerProfile(body);

    const claims = await jwt.verifyAsync<JwtPayload>(data.accessToken);

    expect(claims).toMatchObject({
      sub: USER_ID,
      email: body.email,
      role: 'SELLER',
    });
  });

  it('returns the account alongside the token', async () => {
    const { data } = await service.setSellerProfile(body);

    expect(data.user).toEqual({
      id: USER_ID,
      email: body.email,
      role: 'SELLER',
      emailVerified: false,
    });
    expect(data.expiresIn).toBe('15m');
  });

  it('never puts the password or its hash in the response', async () => {
    const result = await service.setSellerProfile(body);

    expect(JSON.stringify(result)).not.toContain(body.password);
    expect(JSON.stringify(result)).not.toContain('$2b$');
  });

  it('still issues a token when the verification email fails', async () => {
    issue.mockRejectedValue(new Error('brevo is down'));

    const { data } = await service.setSellerProfile(body);

    expect(typeof data.accessToken).toBe('string');
  });
});
