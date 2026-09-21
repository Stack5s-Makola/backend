import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { SetSellerProfileDto } from './dto';
import { RegisterService } from './register.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

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
  let service: RegisterService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Nothing taken by default.
    findOne.mockResolvedValue(null);
    insert.mockResolvedValue({ identifiers: [{ id: USER_ID }] });
    transaction.mockImplementation((run: (m: unknown) => Promise<unknown>) =>
      run({ insert }),
    );

    const module = await Test.createTestingModule({
      providers: [
        RegisterService,
        {
          provide: getDataSourceToken(),
          useValue: { transaction, getRepository: () => ({ findOne }) },
        },
      ],
    }).compile();

    service = module.get(RegisterService);
  });

  it('says yes once the account and shop are written', async () => {
    await expect(service.setSellerProfile(body)).resolves.toEqual({
      message: 'Seller profile created',
      data: { saved: true },
    });
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
});
