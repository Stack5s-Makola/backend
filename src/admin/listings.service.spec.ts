import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MapService } from '../map/map.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { ListingsService } from './listings.service';

const LISTED = new Date('2026-05-06T11:00:00.000Z');

function shop(overrides: Partial<Seller> = {}): Seller {
  return {
    id: 'bbbbbbbb-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    shopName: 'Makola Fabrics',
    verificationStatus: 'approved',
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
    quantity: 4,
    tags: [],
    approvalStatus: 'pending',
    moderationNote: null,
    moderatedBy: null,
    moderatedAt: null,
    createdAt: LISTED,
    updatedAt: LISTED,
    seller: shop(),
    ...overrides,
  } as Product;
}

describe('ListingsService.list', () => {
  const find = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const sellerFindOne = jest.fn();
  const userFindOne = jest.fn();
  const notify = jest.fn();
  const reverseGeocode = jest.fn();
  const sellerUpdate = jest.fn();
  let service: ListingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    findOne.mockResolvedValue(listing());
    update.mockResolvedValue({ affected: 1 });
    sellerFindOne.mockResolvedValue({
      id: 'bbbbbbbb-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
    });
    notify.mockResolvedValue(undefined);
    userFindOne.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      fullName: 'Ama Mensah',
      email: 'ama@example.com',
      phone: '0241234567',
      emailVerified: true,
    });

    const module = await Test.createTestingModule({
      providers: [
        ListingsService,
        {
          provide: getRepositoryToken(Product),
          useValue: { find, findOne, update },
        },
        {
          provide: getRepositoryToken(Seller),
          useValue: { findOne: sellerFindOne, update: sellerUpdate },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: userFindOne },
        },
        { provide: NotificationsService, useValue: { notify } },
        { provide: MapService, useValue: { reverseGeocode } },
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
          location: null,
          locationName: null,
          coordinates: { latitude: 5.55, longitude: -0.2 },
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

  it('takes the coordinates from the seller, as numbers', async () => {
    find.mockResolvedValue([
      listing({
        seller: shop({
          latitude: '5.5500000' as unknown as number,
          longitude: '-0.2000000' as unknown as number,
        }),
      }),
    ]);

    const { data } = await service.list();

    expect(data[0].coordinates).toEqual({ latitude: 5.55, longitude: -0.2 });
  });

  it('gives the place name as location, not the coordinates', async () => {
    find.mockResolvedValue([
      listing({ seller: shop({ locationName: 'Ussher Town, Accra, Ghana' }) }),
    ]);

    const { data } = await service.list();

    expect(data[0].location).toBe('Ussher Town, Accra, Ghana');
    expect(data[0].locationName).toBe('Ussher Town, Accra, Ghana');
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

  it('gives null coordinates when the seller has none', async () => {
    find.mockResolvedValue([
      listing({ seller: shop({ latitude: undefined, longitude: undefined }) }),
    ]);

    const { data } = await service.list();

    expect(data[0].coordinates).toBeNull();
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

  describe('approve, telling the seller', () => {
    const ID = 'cccccccc-1111-4111-8111-111111111111';
    const ADMIN = '11111111-1111-4111-8111-111111111111';

    it('notifies the shop owner', async () => {
      await service.approve(ID, ADMIN);

      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '22222222-2222-4222-8222-222222222222',
          type: 'listing_approved',
          referenceId: ID,
        }),
      );
    });

    it('names the listing in the message', async () => {
      await service.approve(ID, ADMIN);

      const [input] = notify.mock.calls[0] as [{ body: string }];

      expect(input.body).toContain('Kente cloth');
    });

    it('sends nothing when the listing has no seller', async () => {
      findOne.mockResolvedValue(listing({ seller: undefined }));

      await service.approve(ID, ADMIN);

      expect(notify).not.toHaveBeenCalled();
    });

    it('skips a shop whose userId is not a uuid', async () => {
      // sellers.userId is a varchar; a non-uuid would fail the insert.
      sellerFindOne.mockResolvedValue({ id: 'shop', userId: 'not-a-uuid' });

      await service.approve(ID, ADMIN);

      expect(notify).not.toHaveBeenCalled();
    });

    it('sends nothing when it was already approved', async () => {
      findOne.mockResolvedValue(listing({ approvalStatus: 'approved' }));

      await service.approve(ID, ADMIN);

      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('detail', () => {
    const ID = 'cccccccc-1111-4111-8111-111111111111';

    it('returns the product in full', async () => {
      findOne.mockResolvedValue(
        listing({
          price: '250.50' as unknown as number,
          quantity: 12,
          tags: ['kente', 'cloth'],
          imageUrl: 'https://cdn/kente.jpg',
        }),
      );

      const { message, data } = await service.detail(ID);

      expect(message).toBe('Listing retrieved');
      expect(data).toMatchObject({
        id: ID,
        product: 'Kente cloth',
        price: 250.5,
        quantity: 12,
        tags: ['kente', 'cloth'],
        image: 'https://cdn/kente.jpg',
        status: 'pending',
      });
    });

    it('carries the shop and the person behind it', async () => {
      const { data } = await service.detail(ID);

      expect(data.shop).toMatchObject({
        shopName: 'Makola Fabrics',
        ownerName: 'Ama Mensah',
        ownerEmail: 'ama@example.com',
        ownerPhone: '0241234567',
        isEmailVerified: true,
      });
    });

    it('shows why it was rejected', async () => {
      findOne.mockResolvedValue(
        listing({ approvalStatus: 'rejected', moderationNote: 'Blurry photo' }),
      );

      const { data } = await service.detail(ID);

      expect(data).toMatchObject({
        status: 'rejected',
        moderationNote: 'Blurry photo',
      });
    });

    it('reports isEmailVerified false when the owner is not verified', async () => {
      userFindOne.mockResolvedValue({ id: 'u', emailVerified: false });

      const { data } = await service.detail(ID);

      expect(data.shop?.isEmailVerified).toBe(false);
    });

    it('survives a listing with no shop', async () => {
      findOne.mockResolvedValue(listing({ seller: undefined }));

      const { data } = await service.detail(ID);

      expect(data.shop).toBeNull();
      expect(data.location).toBeNull();
    });

    it('skips the owner lookup when the shop userId is not a uuid', async () => {
      // sellers.userId is a varchar; a non-uuid would fail the query.
      findOne.mockResolvedValue(
        listing({ seller: shop({ userId: 'not-a-uuid' }) }),
      );

      const { data } = await service.detail(ID);

      expect(userFindOne).not.toHaveBeenCalled();
      expect(data.shop?.ownerEmail).toBeNull();
    });

    it('404s when nothing has that id', async () => {
      findOne.mockResolvedValue(null);

      await expect(service.detail(ID)).rejects.toThrow(
        new NotFoundException('No listing found for that id'),
      );
    });
  });
});
