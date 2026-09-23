import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { ListingsService } from './listings.service';

const LISTED = new Date('2026-05-06T11:00:00.000Z');

function shop(overrides: Partial<Seller> = {}): Seller {
  return {
    id: 'bbbbbbbb-1111-4111-8111-111111111111',
    shopName: 'Makola Fabrics',
    latitude: 5.55,
    longitude: -0.2,
    ...overrides,
  } as Seller;
}

function listing(overrides: Partial<Product> = {}): Product {
  return {
    id: 'cccccccc-1111-4111-8111-111111111111',
    name: 'Kente cloth',
    price: 250,
    approvalStatus: 'pending',
    createdAt: LISTED,
    seller: shop(),
    ...overrides,
  } as Product;
}

describe('ListingsService.list', () => {
  const find = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  let service: ListingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    findOne.mockResolvedValue(listing());
    update.mockResolvedValue({ affected: 1 });

    const module = await Test.createTestingModule({
      providers: [
        ListingsService,
        {
          provide: getRepositoryToken(Product),
          useValue: { find, findOne, update },
        },
      ],
    }).compile();

    service = module.get(ListingsService);
  });

  it('maps a listing onto the row the table needs', async () => {
    find.mockResolvedValue([listing()]);

    await expect(service.list()).resolves.toEqual({
      message: 'Listings retrieved',
      data: [
        {
          id: 'cccccccc-1111-4111-8111-111111111111',
          product: 'Kente cloth',
          seller: 'Makola Fabrics',
          location: { latitude: 5.55, longitude: -0.2 },
          date: '2026-05-06T11:00:00.000Z',
          status: 'pending',
          image: null,
        },
      ],
    });
  });

  it('loads the seller and asks for the newest first', async () => {
    find.mockResolvedValue([]);

    await service.list();

    expect(find).toHaveBeenCalledWith({
      relations: { seller: true },
      order: { createdAt: 'DESC' },
    });
  });

  it.each(['pending', 'approved', 'rejected', 'removed'] as const)(
    'passes through the %s status unchanged',
    async (status) => {
      find.mockResolvedValue([listing({ approvalStatus: status })]);

      const { data } = await service.list();

      expect(data[0].status).toBe(status);
    },
  );

  it('takes the location from the seller, as numbers', async () => {
    find.mockResolvedValue([
      listing({
        seller: shop({
          latitude: '5.5500000' as unknown as number,
          longitude: '-0.2000000' as unknown as number,
        }),
      }),
    ]);

    const { data } = await service.list();

    expect(data[0].location).toEqual({ latitude: 5.55, longitude: -0.2 });
  });

  it('survives a listing whose seller is missing', async () => {
    find.mockResolvedValue([listing({ seller: undefined })]);

    const { data } = await service.list();

    expect(data[0]).toMatchObject({
      seller: null,
      location: null,
      product: 'Kente cloth',
    });
  });

  it('gives a null location when the seller has no coordinates', async () => {
    find.mockResolvedValue([
      listing({ seller: shop({ latitude: undefined, longitude: undefined }) }),
    ]);

    const { data } = await service.list();

    expect(data[0].location).toBeNull();
  });

  it('uses imageUrl once the column exists', async () => {
    find.mockResolvedValue([listing({ imageUrl: 'https://cdn/kente.jpg' })]);

    const { data } = await service.list();

    expect(data[0].image).toBe('https://cdn/kente.jpg');
  });

  it('returns an empty list when there are no listings', async () => {
    find.mockResolvedValue([]);

    await expect(service.list()).resolves.toEqual({
      message: 'Listings retrieved',
      data: [],
    });
  });

  describe('approve', () => {
    const ID = 'cccccccc-1111-4111-8111-111111111111';
    const ADMIN = '11111111-1111-4111-8111-111111111111';

    it('flips a pending listing to approved', async () => {
      await expect(service.approve(ID, ADMIN)).resolves.toEqual({
        message: 'Listing approved',
        data: { id: ID, status: 'approved', changed: true },
      });
      expect(update).toHaveBeenCalledWith(
        { id: ID },
        expect.objectContaining({ approvalStatus: 'approved' }),
      );
    });

    it('clears the moderation note, which explained a rejection', async () => {
      findOne.mockResolvedValue(
        listing({ approvalStatus: 'rejected', moderationNote: 'Blurry' }),
      );

      await service.approve(ID, ADMIN);

      expect(update).toHaveBeenCalledWith(
        { id: ID },
        expect.objectContaining({ moderationNote: null }),
      );
    });

    it('records which admin did it, and when', async () => {
      await service.approve(ID, ADMIN);

      const [, values] = update.mock.calls[0] as [
        unknown,
        { moderatedBy: string | null; moderatedAt: Date },
      ];

      expect(values.moderatedBy).toBe(ADMIN);
      expect(values.moderatedAt).toBeInstanceOf(Date);
    });

    it('records null rather than the super admin sentinel', async () => {
      // `moderatedBy` is a uuid column; "super-admin" would fail the query.
      await service.approve(ID, 'super-admin');

      const [, values] = update.mock.calls[0] as [
        unknown,
        { moderatedBy: string | null },
      ];

      expect(values.moderatedBy).toBeNull();
    });

    it('is a no-op when it was already approved', async () => {
      findOne.mockResolvedValue(listing({ approvalStatus: 'approved' }));

      await expect(service.approve(ID, ADMIN)).resolves.toEqual({
        message: 'That listing was already approved',
        data: { id: ID, status: 'approved', changed: false },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it.each(['rejected', 'removed'] as const)(
      'can approve a %s listing, reinstating it',
      async (status) => {
        findOne.mockResolvedValue(listing({ approvalStatus: status }));

        const { data } = await service.approve(ID, ADMIN);

        expect(data.changed).toBe(true);
      },
    );

    it('404s when nothing has that id', async () => {
      findOne.mockResolvedValue(null);

      await expect(service.approve(ID, ADMIN)).rejects.toThrow(
        new NotFoundException('No listing found for that id'),
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
