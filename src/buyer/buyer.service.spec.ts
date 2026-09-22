import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../categories/entities/Categories.entity';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { SavedProduct } from '../saved/entities/SavedProduct.entity';
import { SavedSeller } from '../saved/entities/SavedSeller.entity';
import { User } from '../users/entities/user.entity';
import { BuyerService } from './buyer.service';

const LISTED = new Date('2026-05-06T11:00:00.000Z');

// Accra, and a shop about 3km away
const ACCRA = { latitude: 5.55, longitude: -0.2 };
const NEARBY = { latitude: 5.575, longitude: -0.2 };
// Kumasi, roughly 200km north
const FAR = { latitude: 6.7, longitude: -1.62 };

function shop(overrides: Partial<Seller> = {}): Seller {
  return {
    id: 'bbbbbbbb-1111-4111-8111-111111111111',
    shopName: 'Makola Fabrics',
    latitude: NEARBY.latitude,
    longitude: NEARBY.longitude,
    ...overrides,
  } as Seller;
}

function listing(overrides: Partial<Product> = {}): Product {
  return {
    id: 'cccccccc-1111-4111-8111-111111111111',
    name: 'Kente cloth',
    price: 250,
    approvalStatus: 'approved',
    createdAt: LISTED,
    seller: shop(),
    category: { id: 'cat', name: 'Fabrics' } as Category,
    ...overrides,
  } as Product;
}

describe('BuyerService', () => {
  const productFindOne = jest.fn();
  const userFindOne = jest.fn();
  const savedProductFind = jest.fn();
  const savedShopFind = jest.fn();
  const getMany = jest.fn();
  const andWhere = jest.fn();
  const where = jest.fn();
  let service: BuyerService;

  /**
   * Records every chained call so the built query can be asserted on.
   *
   * Typed as the shape BuyerService uses rather than the whole query builder,
   * which has far more on it than this needs.
   */
  interface FakeBuilder {
    leftJoinAndSelect: (...args: unknown[]) => FakeBuilder;
    where: (...args: unknown[]) => FakeBuilder;
    orderBy: (...args: unknown[]) => FakeBuilder;
    andWhere: (...args: unknown[]) => FakeBuilder;
    getMany: () => Promise<Product[]>;
  }

  const builder: FakeBuilder = {
    leftJoinAndSelect: () => builder,
    where: (...args: unknown[]) => {
      where(...args);
      return builder;
    },
    orderBy: () => builder,
    andWhere: (...args: unknown[]) => {
      andWhere(...args);
      return builder;
    },
    getMany: () => getMany() as Promise<Product[]>,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    getMany.mockResolvedValue([]);
    savedProductFind.mockResolvedValue([]);
    savedShopFind.mockResolvedValue([]);
    productFindOne.mockResolvedValue(listing());
    userFindOne.mockResolvedValue({
      id: 'user-a',
      email: 'kofi@example.com',
      phone: '0241234567',
      role: 'BUYER',
      status: 'active',
      emailVerified: true,
      createdAt: new Date('2026-03-04T09:30:00.000Z'),
      passwordHash: '$2b$10$notreal',
    });

    const module = await Test.createTestingModule({
      providers: [
        BuyerService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            createQueryBuilder: () => builder,
            findOne: productFindOne,
          },
        },
        {
          provide: getRepositoryToken(SavedProduct),
          useValue: { find: savedProductFind },
        },
        {
          provide: getRepositoryToken(SavedSeller),
          useValue: { find: savedShopFind },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: userFindOne },
        },
      ],
    }).compile();

    service = module.get(BuyerService);
  });

  describe('browse', () => {
    it('maps a listing onto a product card', async () => {
      getMany.mockResolvedValue([listing()]);

      await expect(service.browse({})).resolves.toEqual({
        message: 'Products retrieved',
        data: [
          {
            id: 'cccccccc-1111-4111-8111-111111111111',
            name: 'Kente cloth',
            price: 250,
            image: null,
            category: 'Fabrics',
            tags: [],
            seller: {
              id: 'bbbbbbbb-1111-4111-8111-111111111111',
              shopName: 'Makola Fabrics',
            },
            location: NEARBY,
            listedAt: '2026-05-06T11:00:00.000Z',
          },
        ],
      });
    });

    it('asks for approved listings only', async () => {
      await service.browse({});

      expect(where).toHaveBeenCalledWith('product.approvalStatus = :status', {
        status: 'approved',
      });
    });

    it('adds no category filter when none is asked for', async () => {
      await service.browse({});

      expect(andWhere).not.toHaveBeenCalled();
    });

    it('filters by category, ignoring case', async () => {
      await service.browse({ category: 'Fabrics' });

      expect(andWhere).toHaveBeenCalledWith(
        'LOWER(category.name) = LOWER(:category)',
        { category: 'Fabrics' },
      );
    });

    it('returns price as a number even though pg sends a string', async () => {
      getMany.mockResolvedValue([
        listing({ price: '250.00' as unknown as number }),
      ]);

      const { data } = await service.browse({});

      expect(data[0].price).toBe(250);
    });

    it('has a null category when the listing has none', async () => {
      getMany.mockResolvedValue([listing({ category: undefined })]);

      const { data } = await service.browse({});

      expect(data[0].category).toBeNull();
    });

    it('has no distance when no coordinates are sent', async () => {
      getMany.mockResolvedValue([listing()]);

      const { data } = await service.browse({});

      expect(data[0]).not.toHaveProperty('distanceKm');
    });

    it('works out the distance when coordinates are sent', async () => {
      getMany.mockResolvedValue([listing()]);

      const { data } = await service.browse(ACCRA);

      expect(data[0].distanceKm).toBeGreaterThan(2);
      expect(data[0].distanceKm).toBeLessThan(4);
    });

    it('drops anything outside the radius', async () => {
      getMany.mockResolvedValue([
        listing({ id: 'near', seller: shop() }),
        listing({ id: 'far', seller: shop({ ...FAR, id: 'other' }) }),
      ]);

      const { data } = await service.browse({ ...ACCRA, radiusKm: 25 });

      expect(data.map((card) => card.id)).toEqual(['near']);
    });

    it('puts the nearest shop first', async () => {
      getMany.mockResolvedValue([
        listing({ id: 'far', seller: shop({ ...FAR, id: 'other' }) }),
        listing({ id: 'near', seller: shop() }),
      ]);

      const { data } = await service.browse({ ...ACCRA, radiusKm: 500 });

      expect(data.map((card) => card.id)).toEqual(['near', 'far']);
    });

    it('drops a shop with no coordinates from a radius search', async () => {
      getMany.mockResolvedValue([
        listing({
          seller: shop({ latitude: undefined, longitude: undefined }),
        }),
      ]);

      expect((await service.browse(ACCRA)).data).toEqual([]);
    });

    it('still lists a shop with no coordinates when not searching by distance', async () => {
      getMany.mockResolvedValue([
        listing({
          seller: shop({ latitude: undefined, longitude: undefined }),
        }),
      ]);

      const { data } = await service.browse({});

      expect(data).toHaveLength(1);
      expect(data[0].location).toBeNull();
    });

    it('survives a listing whose seller is missing', async () => {
      getMany.mockResolvedValue([listing({ seller: undefined })]);

      const { data } = await service.browse({});

      expect(data[0]).toMatchObject({ seller: null, location: null });
    });

    it('ignores a radius when no coordinates came with it', async () => {
      getMany.mockResolvedValue([
        listing({ seller: shop({ ...FAR, id: 'other' }) }),
      ]);

      expect((await service.browse({ radiusKm: 1 })).data).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('matches the name or the category, anywhere and any case', async () => {
      await service.search({ q: 'ken' });

      expect(andWhere).toHaveBeenCalledWith(
        '(product.name ILIKE :term OR category.name ILIKE :term)',
        { term: '%ken%' },
      );
    });

    it('still only returns approved listings', async () => {
      await service.search({ q: 'ken' });

      expect(where).toHaveBeenCalledWith('product.approvalStatus = :status', {
        status: 'approved',
      });
    });

    it('combines a search term with a category filter', async () => {
      await service.search({ q: 'ken', category: 'Fabrics' });

      expect(andWhere).toHaveBeenCalledWith(
        'LOWER(category.name) = LOWER(:category)',
        { category: 'Fabrics' },
      );
      expect(andWhere).toHaveBeenCalledTimes(2);
    });

    it('still filters by distance when coordinates come too', async () => {
      getMany.mockResolvedValue([
        listing({ id: 'near', seller: shop() }),
        listing({ id: 'far', seller: shop({ ...FAR, id: 'other' }) }),
      ]);

      const { data } = await service.search({
        q: 'ken',
        ...ACCRA,
        radiusKm: 25,
      });

      expect(data.map((card) => card.id)).toEqual(['near']);
    });

    it('returns an empty list when nothing matches', async () => {
      await expect(service.search({ q: 'nothing' })).resolves.toEqual({
        message: 'Products retrieved',
        data: [],
      });
    });
  });

  describe('tags', () => {
    it('is an empty list, since no tags column exists yet', async () => {
      getMany.mockResolvedValue([listing()]);

      const { data } = await service.browse({});

      expect(data[0].tags).toEqual([]);
    });

    it('passes tags through the day the column is real', async () => {
      getMany.mockResolvedValue([
        listing({ tags: ['kente', 'handmade', 'cloth'] }),
      ]);

      const { data } = await service.browse({});

      expect(data[0].tags).toEqual(['kente', 'handmade', 'cloth']);
    });

    it('does not search tags - there is no column to match on', async () => {
      await service.search({ q: 'handmade' });

      expect(andWhere).toHaveBeenCalledWith(
        '(product.name ILIKE :term OR category.name ILIKE :term)',
        { term: '%handmade%' },
      );
    });
  });

  describe('savedProductsFor', () => {
    const USER = '11111111-1111-4111-8111-111111111111';

    it('returns the saved products as full cards', async () => {
      savedProductFind.mockResolvedValue([{ id: 's1', product: listing() }]);

      const { message, data } = await service.savedProductsFor(USER);

      expect(message).toBe('Saved products retrieved');
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        name: 'Kente cloth',
        price: 250,
        category: 'Fabrics',
        seller: { shopName: 'Makola Fabrics' },
      });
    });

    it('asks only for this buyer s saves', async () => {
      await service.savedProductsFor(USER);

      expect(savedProductFind).toHaveBeenCalledWith({
        where: { user: { id: USER } },
        relations: { product: { seller: true, category: true } },
      });
    });

    it('keeps a save whose listing is no longer approved', async () => {
      savedProductFind.mockResolvedValue([
        { id: 's1', product: listing({ approvalStatus: 'pending' }) },
      ]);

      expect((await service.savedProductsFor(USER)).data).toHaveLength(1);
    });

    it('skips a save whose product was deleted', async () => {
      savedProductFind.mockResolvedValue([
        { id: 's1', product: null },
        { id: 's2', product: listing() },
      ]);

      expect((await service.savedProductsFor(USER)).data).toHaveLength(1);
    });

    it('is empty when the buyer saved nothing', async () => {
      await expect(service.savedProductsFor(USER)).resolves.toEqual({
        message: 'Saved products retrieved',
        data: [],
      });
    });
  });

  describe('savedShopsFor', () => {
    const USER = '11111111-1111-4111-8111-111111111111';

    it('returns the saved shops', async () => {
      savedShopFind.mockResolvedValue([
        { id: 's1', seller: shop({ verificationStatus: 'approved' }) },
      ]);

      const { message, data } = await service.savedShopsFor(USER);

      expect(message).toBe('Saved shops retrieved');
      expect(data).toEqual([
        {
          id: 'bbbbbbbb-1111-4111-8111-111111111111',
          shopName: 'Makola Fabrics',
          logo: null,
          location: NEARBY,
          verificationStatus: 'approved',
        },
      ]);
    });

    it('asks only for this buyer s saves', async () => {
      await service.savedShopsFor(USER);

      expect(savedShopFind).toHaveBeenCalledWith({
        where: { user: { id: USER } },
        relations: { seller: true },
      });
    });

    it('gives a null location when the shop has no coordinates', async () => {
      savedShopFind.mockResolvedValue([
        {
          id: 's1',
          seller: shop({ latitude: undefined, longitude: undefined }),
        },
      ]);

      expect((await service.savedShopsFor(USER)).data[0].location).toBeNull();
    });

    it('skips a save whose shop was deleted', async () => {
      savedShopFind.mockResolvedValue([{ id: 's1', seller: null }]);

      expect((await service.savedShopsFor(USER)).data).toEqual([]);
    });

    it('is empty when the buyer saved nothing', async () => {
      await expect(service.savedShopsFor(USER)).resolves.toEqual({
        message: 'Saved shops retrieved',
        data: [],
      });
    });
  });

  describe('product', () => {
    const ID = 'cccccccc-1111-4111-8111-111111111111';

    it('returns the listing in full', async () => {
      const { message, data } = await service.product(ID);

      expect(message).toBe('Product retrieved');
      expect(data).toMatchObject({
        id: ID,
        name: 'Kente cloth',
        price: 250,
        category: 'Fabrics',
        tags: [],
        status: 'approved',
        shop: { shopName: 'Makola Fabrics', verificationStatus: undefined },
      });
    });

    it('404s when nothing has that id', async () => {
      productFindOne.mockResolvedValue(null);

      await expect(service.product(ID)).rejects.toThrow(
        new NotFoundException('No product found for that id'),
      );
    });

    it('returns an unapproved listing, with its status', async () => {
      productFindOne.mockResolvedValue(listing({ approvalStatus: 'removed' }));

      const { data } = await service.product(ID);

      expect(data.status).toBe('removed');
    });

    it('survives a listing with no seller', async () => {
      productFindOne.mockResolvedValue(listing({ seller: undefined }));

      const { data } = await service.product(ID);

      expect(data.shop).toBeNull();
      expect(data.location).toBeNull();
    });
  });

  describe('profile', () => {
    it('is null name and picture while neither column exists', async () => {
      await expect(service.profile('user-a')).resolves.toEqual({
        message: 'Profile retrieved',
        data: {
          name: null,
          profilePicture: null,
          email: 'kofi@example.com',
        },
      });
    });

    it('uses fullName and avatarUrl the day they are real', async () => {
      userFindOne.mockResolvedValue({
        id: 'user-a',
        email: 'kofi@example.com',
        fullName: 'Kofi Boateng',
        avatarUrl: 'https://cdn/kofi.jpg',
        createdAt: new Date(),
      });

      const { data } = await service.profile('user-a');

      expect(data).toMatchObject({
        name: 'Kofi Boateng',
        profilePicture: 'https://cdn/kofi.jpg',
      });
    });

    it('404s when the account is gone', async () => {
      userFindOne.mockResolvedValue(null);

      await expect(service.profile('user-a')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('never returns the password hash', async () => {
      const result = await service.profile('user-a');

      expect(JSON.stringify(result)).not.toContain('$2b$');
    });
  });

  describe('personalDetails', () => {
    it('returns the whole account', async () => {
      await expect(service.personalDetails('user-a')).resolves.toEqual({
        message: 'Personal details retrieved',
        data: {
          id: 'user-a',
          name: null,
          profilePicture: null,
          email: 'kofi@example.com',
          phone: '0241234567',
          role: 'BUYER',
          status: 'active',
          emailVerified: true,
          joined: '2026-03-04T09:30:00.000Z',
        },
      });
    });

    it('never returns the password hash', async () => {
      const result = await service.personalDetails('user-a');

      expect(JSON.stringify(result)).not.toContain('$2b$');
    });

    it('404s when the account is gone', async () => {
      userFindOne.mockResolvedValue(null);

      await expect(service.personalDetails('user-a')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
