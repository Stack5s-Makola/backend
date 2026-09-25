import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { BuyersService } from './buyers.service';

const JOINED = new Date('2026-03-04T09:30:00.000Z');

function buyer(overrides: Partial<User> = {}): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'kofi@example.com',
    phone: '0241234567',
    status: 'active',
    createdAt: JOINED,
    ...overrides,
  } as User;
}

describe('BuyersService.list', () => {
  const find = jest.fn();
  let service: BuyersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        BuyersService,
        { provide: getRepositoryToken(User), useValue: { find } },
      ],
    }).compile();

    service = module.get(BuyersService);
  });

  it('maps a buyer onto the row the table needs', async () => {
    find.mockResolvedValue([buyer()]);

    await expect(service.list()).resolves.toEqual({
      message: 'Buyers retrieved',
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: null,
          email: 'kofi@example.com',
          phone: '0241234567',
          profilePicture: null,
          joined: '2026-03-04T09:30:00.000Z',
          isEmailVerified: false,
          status: 'active',
        },
      ],
    });
  });

  it('asks only for buyers, in both spellings, newest first', async () => {
    find.mockResolvedValue([]);

    await service.list();

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: In(['BUYER', 'buyer']) },
        order: { createdAt: 'DESC' },
      }),
    );
  });

  it('never selects the password hash', async () => {
    find.mockResolvedValue([]);

    await service.list();

    const [options] = find.mock.calls[0] as [
      { select: Record<string, boolean> },
    ];
    const { select } = options;

    expect(select).not.toHaveProperty('passwordHash');
    expect(Object.keys(select).sort()).toEqual([
      'avatarUrl',
      'createdAt',
      'email',
      'emailVerified',
      'fullName',
      'id',
      'phone',
      'status',
    ]);
  });

  it('uses fullName and avatarUrl once the columns exist', async () => {
    find.mockResolvedValue([
      buyer({ fullName: 'Kofi Boateng', avatarUrl: 'https://cdn/kofi.jpg' }),
    ]);

    const { data } = await service.list();

    expect(data[0]).toMatchObject({
      name: 'Kofi Boateng',
      profilePicture: 'https://cdn/kofi.jpg',
    });
  });

  it('leaves phone null when the row has none', async () => {
    find.mockResolvedValue([buyer({ phone: undefined })]);

    const { data } = await service.list();

    expect(data[0].phone).toBeNull();
  });

  it('returns an empty list when there are no buyers', async () => {
    find.mockResolvedValue([]);

    await expect(service.list()).resolves.toEqual({
      message: 'Buyers retrieved',
      data: [],
    });
  });
});
