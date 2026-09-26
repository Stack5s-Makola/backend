import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../categories/entities/Categories.entity';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { SavedProduct } from '../saved/entities/SavedProduct.entity';
import { SavedSeller } from '../saved/entities/SavedSeller.entity';
import { User } from '../users/entities/user.entity';
import { MapService } from '../map/map.service';
import { UploadsService } from '../uploads/uploads.service';
import { BuyerService } from './buyer.service';

const LISTED = new Date('2026-05-06T11:00:00.000Z');

// What the mocked Mapbox resolves every coordinate to.
const PLACE = 'Ussher Town, Accra, Ghana';

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
    // NOT NULL in the schema, so a real row always has one.
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
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
  const sellerGetMany = jest.fn();
  const reverseGeocode = jest.fn();
  const userFind = jest.fn();
  const uploadImage = jest.fn();
  const userUpdate = jest.fn();
  const countsGetRawMany = jest.fn();
  const savedProductFind = jest.fn();
  const savedShopFind = jest.fn();
  const sellerUpdate = jest.fn();
  const productFind = jest.fn();
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

  const countsBuilder = {
    select: () => countsBuilder,
    addSelect: () => countsBuilder,
    where: () => countsBuilder,
    andWhere: () => countsBuilder,
    groupBy: () => countsBuilder,
    getRawMany: () => countsGetRawMany() as Promise<unknown[]>,
  };

  const sellerNearbyBuilder = {
    where: () => sellerNearbyBuilder,
    andWhere: () => sellerNearbyBuilder,
    getMany: () => sellerGetMany() as Promise<Seller[]>,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sellerGetMany.mockResolvedValue([]);
    reverseGeocode.mockResolvedValue('Ussher Town, Accra, Ghana');
    uploadImage.mockResolvedValue({ secure_url: 'https://cdn/pic.png' });
    userFind.mockResolvedValue([]);
    userUpdate.mockResolvedValue({ affected: 1 });
    countsGetRawMany.mockResolvedValue([]);
    getMany.mockResolvedValue([]);
    savedProductFind.mockResolvedValue([]);
    savedShopFind.mockResolvedValue([]);
    sellerUpdate.mockResolvedValue({ affected: 1 });
    productFind.mockResolvedValue([]);
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
            // browse/search use `builder`; the nearby count query needs its
            // own, so hand back whichever the call is for.
            createQueryBuilder: (alias?: string) =>
              alias === 'product' && countsGetRawMany.mock.calls.length >= 0
                ? { ...builder, ...countsBuilder }
                : builder,
            find: productFind,
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
          useValue: {
            findOne: userFindOne,
            update: userUpdate,
            find: userFind,
          },
        },
        {
          provide: getRepositoryToken(Seller),
          useValue: {
            createQueryBuilder: () => sellerNearbyBuilder,
            update: sellerUpdate,
          },
        },
        { provide: MapService, useValue: { reverseGeocode } },
        { provide: UploadsService, useValue: { uploadImage } },
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
            location: PLACE,
            locationName: PLACE,
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
          location: PLACE,
          locationName: PLACE,
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

    it("shows each shop owner's profile picture", async () => {
      const OWNER = '22222222-2222-4222-8222-222222222222';
      savedShopFind.mockResolvedValue([
        {
          id: 's1',
          seller: shop({ userId: OWNER, logoUrl: 'https://cdn/shop.png' }),
        },
      ]);
      userFind.mockResolvedValue([
        { id: OWNER, avatarUrl: 'https://cdn/owner.png' },
      ]);

      expect((await service.savedShopsFor(USER)).data[0].logo).toBe(
        'https://cdn/owner.png',
      );
    });

    it('falls back to the shop logo when the owner has no picture', async () => {
      savedShopFind.mockResolvedValue([
        { id: 's1', seller: shop({ logoUrl: 'https://cdn/shop.png' }) },
      ]);

      expect((await service.savedShopsFor(USER)).data[0].logo).toBe(
        'https://cdn/shop.png',
      );
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

    it("shows the shop owner's profile picture", async () => {
      const OWNER = '22222222-2222-4222-8222-222222222222';
      productFindOne.mockResolvedValue(
        listing({
          seller: shop({ userId: OWNER, logoUrl: 'https://cdn/shop.png' }),
        }),
      );
      userFind.mockResolvedValue([
        { id: OWNER, avatarUrl: 'https://cdn/owner.png' },
      ]);

      const { data } = await service.product(ID);

      expect(data.shop?.logo).toBe('https://cdn/owner.png');
    });

    it('falls back to the shop logo when the owner has no picture', async () => {
      productFindOne.mockResolvedValue(
        listing({ seller: shop({ logoUrl: 'https://cdn/shop.png' }) }),
      );

      const { data } = await service.product(ID);

      expect(data.shop?.logo).toBe('https://cdn/shop.png');
    });

    it('looks up no owner for a listing with no seller', async () => {
      productFindOne.mockResolvedValue(listing({ seller: undefined }));

      await service.product(ID);

      expect(userFind).not.toHaveBeenCalled();
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
          location: null,
          locationName: null,
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
          location: null,
          locationName: null,
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

  describe('nearbyShops', () => {
    const near = { ...shop(), id: 'near' };
    const far = { ...shop({ ...FAR }), id: 'far' };

    it('returns shops sorted nearest first, with distance', async () => {
      sellerGetMany.mockResolvedValue([far, near]);

      const { message, data } = await service.nearbyShops({
        ...ACCRA,
        radiusKm: 500,
      });

      expect(message).toBe('Shops retrieved');
      expect(data.map((s) => s.id)).toEqual(['near', 'far']);
      expect(data[0].distanceKm).toBeGreaterThan(2);
      expect(data[0].distanceKm).toBeLessThan(4);
    });

    it('drops anything outside the radius', async () => {
      sellerGetMany.mockResolvedValue([near, far]);

      const { data } = await service.nearbyShops({ ...ACCRA, radiusKm: 25 });

      expect(data.map((s) => s.id)).toEqual(['near']);
    });

    it('defaults the radius to 25km', async () => {
      sellerGetMany.mockResolvedValue([near, far]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data.map((s) => s.id)).toEqual(['near']);
    });

    it('leaves out a shop with no coordinates entirely', async () => {
      sellerGetMany.mockResolvedValue([
        {
          ...shop({ latitude: undefined, longitude: undefined }),
          id: 'no-loc',
        },
      ]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data).toEqual([]);
    });

    it('carries the readable place name', async () => {
      sellerGetMany.mockResolvedValue([
        { ...near, locationName: 'Ussher Town, Accra, Ghana' } as Seller,
      ]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data[0].locationName).toBe('Ussher Town, Accra, Ghana');
    });

    it('counts the approved listings it returns, so the two agree', async () => {
      sellerGetMany.mockResolvedValue([near]);
      productFind.mockResolvedValue([
        listing({ id: 'p1', seller: near }),
        listing({ id: 'p2', seller: near }),
      ]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data[0].productCount).toBe(2);
      expect(data[0].products).toHaveLength(2);
    });

    it('asks for approved listings only, for the shops in radius', async () => {
      sellerGetMany.mockResolvedValue([near]);

      await service.nearbyShops(ACCRA);

      const [options] = productFind.mock.calls[0] as [
        { where: { approvalStatus: string } },
      ];

      expect(options.where.approvalStatus).toBe('approved');
    });

    it('reports zero for a shop with nothing approved', async () => {
      sellerGetMany.mockResolvedValue([near]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data[0].productCount).toBe(0);
    });

    it('is empty when there are no shops at all', async () => {
      await expect(service.nearbyShops(ACCRA)).resolves.toEqual({
        message: 'Shops retrieved',
        data: [],
      });
    });
  });

  describe('location on the profile', () => {
    it('shows the place name, not the coordinates', async () => {
      userFindOne.mockResolvedValue({
        id: 'user-a',
        email: 'kofi@example.com',
        latitude: 5.5473,
        longitude: -0.2107,
        locationName: 'Ussher Town, Accra, Ghana',
        createdAt: new Date('2026-03-04T09:30:00.000Z'),
      });

      const { data } = await service.profile('user-a');

      expect(data.locationName).toBe('Ussher Town, Accra, Ghana');
      expect(JSON.stringify(data)).not.toContain('5.5473');
    });

    it('is null for an account that never set one', async () => {
      const { data } = await service.profile('user-a');

      expect(data.locationName).toBeNull();
    });

    it('appears on personal details too', async () => {
      userFindOne.mockResolvedValue({
        id: 'user-a',
        email: 'kofi@example.com',
        locationName: 'Adum, Kumasi, Ghana',
        createdAt: new Date('2026-03-04T09:30:00.000Z'),
      });

      const { data } = await service.personalDetails('user-a');

      expect(data.locationName).toBe('Adum, Kumasi, Ghana');
    });
  });

  describe('updateLocation', () => {
    it('resolves the coordinates and stores both', async () => {
      await expect(
        service.updateLocation('user-a', 5.5473, -0.2107),
      ).resolves.toEqual({
        message: 'Location updated',
        data: { locationName: 'Ussher Town, Accra, Ghana' },
      });

      expect(userUpdate).toHaveBeenCalledWith(
        { id: 'user-a' },
        {
          latitude: 5.5473,
          longitude: -0.2107,
          locationName: 'Ussher Town, Accra, Ghana',
        },
      );
    });

    it('still saves the coordinates when Mapbox knows nothing', async () => {
      reverseGeocode.mockResolvedValue(null);

      const { data } = await service.updateLocation('user-a', 0, 0);

      expect(data.locationName).toBeNull();
      expect(userUpdate).toHaveBeenCalled();
    });

    it('still saves them when Mapbox is down', async () => {
      reverseGeocode.mockRejectedValue(new Error('mapbox is down'));

      const { data } = await service.updateLocation('user-a', 5.5, -0.2);

      expect(data.locationName).toBeNull();
      expect(userUpdate).toHaveBeenCalled();
    });

    it('404s when the account is gone', async () => {
      userFindOne.mockResolvedValue(null);

      await expect(service.updateLocation('user-a', 5.5, -0.2)).rejects.toThrow(
        NotFoundException,
      );
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });

  describe('updateName', () => {
    it('changes the name', async () => {
      await expect(
        service.updateName('user-a', 'Kofi Boateng'),
      ).resolves.toEqual({
        message: 'Name updated',
        data: { name: 'Kofi Boateng' },
      });
      expect(userUpdate).toHaveBeenCalledWith(
        { id: 'user-a' },
        { fullName: 'Kofi Boateng' },
      );
    });

    it('404s when the account is gone', async () => {
      userFindOne.mockResolvedValue(null);

      await expect(service.updateName('user-a', 'x')).rejects.toThrow(
        NotFoundException,
      );
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });

  describe('updatePhone', () => {
    it('changes the number', async () => {
      // The account lookup finds them; the uniqueness lookup finds nobody.
      userFindOne
        .mockResolvedValueOnce({ id: 'user-a', email: 'k@example.com' })
        .mockResolvedValueOnce(null);

      await expect(
        service.updatePhone('user-a', '0209999999'),
      ).resolves.toEqual({
        message: 'Phone number updated',
        data: { phone: '0209999999' },
      });
    });

    it('409s when another account has that number', async () => {
      userFindOne
        .mockResolvedValueOnce({ id: 'user-a' })
        .mockResolvedValueOnce({ id: 'someone-else' });

      await expect(service.updatePhone('user-a', '0209999999')).rejects.toThrow(
        ConflictException,
      );
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('excludes the caller from the uniqueness check', async () => {
      userFindOne
        .mockResolvedValueOnce({ id: 'user-a' })
        .mockResolvedValueOnce(null);

      await service.updatePhone('user-a', '0209999999');

      const [options] = userFindOne.mock.calls[1] as [
        { where: Record<string, unknown> },
      ];

      expect(options.where).toHaveProperty('id');
    });
  });

  describe('changePassword', () => {
    const CURRENT = 'correct-horse';
    let hash: string;

    beforeAll(async () => {
      hash = await bcrypt.hash(CURRENT, 10);
    });

    beforeEach(() => {
      userFindOne.mockResolvedValue({
        id: 'user-a',
        email: 'k@example.com',
        passwordHash: hash,
        createdAt: new Date(),
      });
    });

    it('changes it when the current password is right', async () => {
      await expect(
        service.changePassword('user-a', CURRENT, 'a-new-password'),
      ).resolves.toEqual({
        message: 'Password changed',
        data: { changed: true },
      });
    });

    it('stores a bcrypt hash the new password matches', async () => {
      await service.changePassword('user-a', CURRENT, 'a-new-password');

      const [, values] = userUpdate.mock.calls[0] as [
        unknown,
        { passwordHash: string },
      ];

      await expect(
        bcrypt.compare('a-new-password', values.passwordHash),
      ).resolves.toBe(true);
      await expect(bcrypt.compare(CURRENT, values.passwordHash)).resolves.toBe(
        false,
      );
    });

    it('401s on the wrong current password, and writes nothing', async () => {
      await expect(
        service.changePassword('user-a', 'wrong', 'a-new-password'),
      ).rejects.toThrow(
        new UnauthorizedException('Your current password is incorrect'),
      );
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('touches no field but the password', async () => {
      await service.changePassword('user-a', CURRENT, 'a-new-password');

      const [, values] = userUpdate.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];

      expect(Object.keys(values)).toEqual(['passwordHash']);
    });

    it('never returns the hash', async () => {
      const result = await service.changePassword(
        'user-a',
        CURRENT,
        'a-new-password',
      );

      expect(JSON.stringify(result)).not.toContain('$2b$');
    });
  });

  describe('updateProfilePicture', () => {
    const image = {
      buffer: Buffer.from('fake'),
      mimetype: 'image/png',
      size: 1024,
    };

    it('uploads it and stores the url', async () => {
      await expect(
        service.updateProfilePicture('user-a', image),
      ).resolves.toEqual({
        message: 'Profile picture updated',
        data: { profilePicture: 'https://cdn/pic.png' },
      });
      expect(userUpdate).toHaveBeenCalledWith(
        { id: 'user-a' },
        { avatarUrl: 'https://cdn/pic.png' },
      );
    });

    it('400s when no picture was sent', async () => {
      await expect(service.updateProfilePicture('user-a')).rejects.toThrow(
        'No picture was sent',
      );
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('rejects a file that is not an image', async () => {
      await expect(
        service.updateProfilePicture('user-a', {
          ...image,
          mimetype: 'application/pdf',
        }),
      ).rejects.toThrow('must be an image');
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('rejects anything over 5MB', async () => {
      await expect(
        service.updateProfilePicture('user-a', {
          ...image,
          size: 6 * 1024 * 1024,
        }),
      ).rejects.toThrow('under 5MB');
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('leaves the old picture alone when the upload fails', async () => {
      uploadImage.mockRejectedValue(new Error('cloudinary is down'));

      await expect(
        service.updateProfilePicture('user-a', image),
      ).rejects.toThrow('could not be uploaded');
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('404s when the account is gone', async () => {
      userFindOne.mockResolvedValue(null);

      await expect(
        service.updateProfilePicture('user-a', image),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('the picture on a nearby shop', () => {
    const OWNER = '22222222-2222-4222-8222-222222222222';
    const withOwner = (overrides: Partial<Seller> = {}) => ({
      ...shop(),
      id: 'near',
      userId: OWNER,
      ...overrides,
    });

    it('is the owner s profile picture', async () => {
      sellerGetMany.mockResolvedValue([withOwner()]);
      userFind.mockResolvedValue([
        { id: OWNER, avatarUrl: 'https://cdn/owner.png' },
      ]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data[0].logo).toBe('https://cdn/owner.png');
    });

    it('prefers the owner s picture over the shop logo', async () => {
      sellerGetMany.mockResolvedValue([
        withOwner({ logoUrl: 'https://cdn/shop.png' }),
      ]);
      userFind.mockResolvedValue([
        { id: OWNER, avatarUrl: 'https://cdn/owner.png' },
      ]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data[0].logo).toBe('https://cdn/owner.png');
    });

    it('falls back to the shop logo when the owner has no picture', async () => {
      sellerGetMany.mockResolvedValue([
        withOwner({ logoUrl: 'https://cdn/shop.png' }),
      ]);
      userFind.mockResolvedValue([{ id: OWNER, avatarUrl: undefined }]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data[0].logo).toBe('https://cdn/shop.png');
    });

    it('is null when neither exists', async () => {
      sellerGetMany.mockResolvedValue([withOwner()]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(data[0].logo).toBeNull();
    });

    it('skips a shop whose userId is not a uuid, without failing', async () => {
      sellerGetMany.mockResolvedValue([withOwner({ userId: 'not-a-uuid' })]);

      const { data } = await service.nearbyShops(ACCRA);

      expect(userFind).not.toHaveBeenCalled();
      expect(data[0].logo).toBeNull();
    });
  });
});
