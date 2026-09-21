import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { SellersService } from './sellers.service';

const OWNER = '11111111-1111-4111-8111-111111111111';

function seller(overrides: Partial<Seller> = {}): Seller {
  return {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    userId: OWNER,
    shopName: 'Makola Fabrics',
    description: 'cloth',
    verificationStatus: 'approved',
    latitude: 5.55,
    longitude: -0.2,
    createdAt: new Date(),
    updatedAt: new Date(),
    products: [],
    ...overrides,
  };
}

describe('SellersService.list', () => {
  const sellerFind = jest.fn();
  const userFind = jest.fn();
  let service: SellersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    userFind.mockResolvedValue([{ id: OWNER, email: 'ama@example.com' }]);

    const module = await Test.createTestingModule({
      providers: [
        SellersService,
        {
          provide: getRepositoryToken(Seller),
          useValue: { find: sellerFind },
        },
        { provide: getRepositoryToken(User), useValue: { find: userFind } },
      ],
    }).compile();

    service = module.get(SellersService);
  });

  it('uses fullName and avatarUrl once the columns exist', async () => {
    sellerFind.mockResolvedValue([seller()]);
    userFind.mockResolvedValue([
      {
        id: OWNER,
        email: 'ama@example.com',
        fullName: 'Ama Mensah',
        avatarUrl: 'https://cdn/ama.jpg',
      },
    ]);

    const { data } = await service.list();

    expect(data[0]).toMatchObject({
      name: 'Ama Mensah',
      profilePicture: 'https://cdn/ama.jpg',
    });
  });

  it('prefers the shop logo over the owner avatar', async () => {
    sellerFind.mockResolvedValue([seller({ logoUrl: 'https://cdn/shop.png' })]);
    userFind.mockResolvedValue([
      { id: OWNER, email: 'ama@example.com', avatarUrl: 'https://cdn/ama.jpg' },
    ]);

    const { data } = await service.list();

    expect(data[0].profilePicture).toBe('https://cdn/shop.png');
  });

  it('is null for both, as today, while neither column exists', async () => {
    sellerFind.mockResolvedValue([seller()]);

    const { data } = await service.list();

    expect(data[0].name).toBeNull();
    expect(data[0].profilePicture).toBeNull();
  });

  it('maps a seller onto the row the table needs', async () => {
    sellerFind.mockResolvedValue([seller()]);

    const { data } = await service.list();

    expect(data).toEqual([
      {
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        name: null,
        email: 'ama@example.com',
        profilePicture: null,
        businessName: 'Makola Fabrics',
        location: { latitude: 5.55, longitude: -0.2 },
        status: 'approved',
      },
    ]);
  });

  it('returns coordinates as numbers even though pg sends strings', async () => {
    sellerFind.mockResolvedValue([
      seller({
        latitude: '5.5500000' as unknown as number,
        longitude: '-0.2000000' as unknown as number,
      }),
    ]);

    const { data } = await service.list();

    expect(data[0].location).toEqual({ latitude: 5.55, longitude: -0.2 });
  });

  it('gives a null location when coordinates are missing', async () => {
    sellerFind.mockResolvedValue([
      seller({ latitude: undefined, longitude: undefined }),
    ]);

    const { data } = await service.list();

    expect(data[0].location).toBeNull();
  });

  it('leaves email null when no user row matches', async () => {
    sellerFind.mockResolvedValue([seller()]);
    userFind.mockResolvedValue([]);

    const { data } = await service.list();

    expect(data[0].email).toBeNull();
  });

  it('skips the user lookup when no userId is a uuid', async () => {
    sellerFind.mockResolvedValue([seller({ userId: 'not-a-uuid' })]);

    const { data } = await service.list();

    expect(userFind).not.toHaveBeenCalled();
    expect(data[0].email).toBeNull();
    // the row still renders - one bad reference must not empty the table
    expect(data[0].businessName).toBe('Makola Fabrics');
  });

  it('returns an empty list when there are no sellers', async () => {
    sellerFind.mockResolvedValue([]);

    await expect(service.list()).resolves.toEqual({
      message: 'Sellers retrieved',
      data: [],
    });
  });

  it('asks for the newest sellers first', async () => {
    sellerFind.mockResolvedValue([]);

    await service.list();

    expect(sellerFind).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
  });
});
