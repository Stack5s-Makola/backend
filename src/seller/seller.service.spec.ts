import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../categories/entities/Categories.entity';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import { AddProductDto } from './dto';
import { SellerService } from './seller.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SHOP_ID = 'bbbbbbbb-1111-4111-8111-111111111111';

const shop = {
  id: SHOP_ID,
  userId: USER_ID,
  shopName: 'Makola Fabrics',
  verificationStatus: 'approved',
  latitude: 5.575,
  longitude: -0.2,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
} as Seller;

function listing(overrides: Partial<Product> = {}): Product {
  return {
    id: 'cccccccc-1111-4111-8111-111111111111',
    name: 'Kente cloth',
    price: 250,
    quantity: 4,
    tags: ['kente'],
    approvalStatus: 'pending',
    moderationNote: null,
    createdAt: new Date('2026-05-06T11:00:00.000Z'),
    category: { id: 'cat', name: 'Fabrics' } as Category,
    ...overrides,
  } as Product;
}

const image = {
  buffer: Buffer.from('fake'),
  mimetype: 'image/png',
  size: 1024,
};

const body: AddProductDto = {
  name: 'Kente cloth',
  category: 'Fabrics',
  tags: ['kente'],
  price: 250,
  quantity: 4,
};

describe('SellerService', () => {
  const productFind = jest.fn();
  const productInsert = jest.fn();
  const sellerFindOne = jest.fn();
  const sellerUpdate = jest.fn();
  const userFindOne = jest.fn();
  const categorySave = jest.fn();
  const categoryGetOne = jest.fn();
  const uploadImage = jest.fn();
  const getRawMany = jest.fn();
  let service: SellerService;

  const productBuilder = {
    select: () => productBuilder,
    addSelect: () => productBuilder,
    where: () => productBuilder,
    groupBy: () => productBuilder,
    getRawMany: () => getRawMany() as Promise<unknown[]>,
  };

  const categoryBuilder = {
    where: () => categoryBuilder,
    getOne: () => categoryGetOne() as Promise<Category | null>,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sellerFindOne.mockResolvedValue(shop);
    userFindOne.mockResolvedValue({
      id: USER_ID,
      email: 'ama@example.com',
      phone: '0241234567',
      avatarUrl: 'https://cdn/ama.jpg',
    });
    productFind.mockResolvedValue([]);
    getRawMany.mockResolvedValue([]);
    productInsert.mockResolvedValue({ identifiers: [{ id: 'new-id' }] });
    categoryGetOne.mockResolvedValue({ id: 'cat', name: 'Fabrics' });
    uploadImage.mockResolvedValue({ secure_url: 'https://cdn/pic.png' });

    const module = await Test.createTestingModule({
      providers: [
        SellerService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            find: productFind,
            insert: productInsert,
            createQueryBuilder: () => productBuilder,
          },
        },
        {
          provide: getRepositoryToken(Seller),
          useValue: { findOne: sellerFindOne, update: sellerUpdate },
        },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            createQueryBuilder: () => categoryBuilder,
            save: categorySave,
            create: (x: unknown) => x,
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: userFindOne },
        },
        { provide: UploadsService, useValue: { uploadImage } },
      ],
    }).compile();

    service = module.get(SellerService);
  });

  describe('dashboard', () => {
    it('counts each status, and totals them', async () => {
      getRawMany.mockResolvedValue([
        { status: 'approved', count: '7' },
        { status: 'pending', count: '2' },
        { status: 'rejected', count: '1' },
      ]);

      const { data } = await service.dashboard(USER_ID);

      expect(data).toMatchObject({
        totalListings: 10,
        approved: 7,
        pending: 2,
        rejected: 1,
      });
    });

    it('reports zeroes for a shop with nothing listed', async () => {
      const { data } = await service.dashboard(USER_ID);

      expect(data).toMatchObject({
        totalListings: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        recentListings: [],
      });
    });

    it('asks for only the five newest listings', async () => {
      await service.dashboard(USER_ID);

      expect(productFind).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
          take: 5,
        }),
      );
    });

    it('uses the avatar, falling back to the shop logo', async () => {
      userFindOne.mockResolvedValue({ id: USER_ID, avatarUrl: undefined });
      sellerFindOne.mockResolvedValue({
        ...shop,
        logoUrl: 'https://cdn/s.png',
      });

      const { data } = await service.dashboard(USER_ID);

      expect(data.avatar).toBe('https://cdn/s.png');
    });

    it('403s for an account with no shop', async () => {
      sellerFindOne.mockResolvedValue(null);

      await expect(service.dashboard(USER_ID)).rejects.toThrow(
        new ForbiddenException('This account does not have a shop'),
      );
    });
  });

  describe('shop', () => {
    it('returns the seller s own listings, newest first', async () => {
      productFind.mockResolvedValue([listing()]);

      const { data } = await service.shop(USER_ID, {});

      expect(data[0]).toEqual({
        id: 'cccccccc-1111-4111-8111-111111111111',
        name: 'Kente cloth',
        price: 250,
        quantity: 4,
        image: null,
        category: 'Fabrics',
        tags: ['kente'],
        status: 'pending',
        moderationNote: null,
        listedAt: '2026-05-06T11:00:00.000Z',
      });
    });

    it('scopes the query to this shop', async () => {
      await service.shop(USER_ID, {});

      expect(productFind).toHaveBeenCalledWith(
        expect.objectContaining({ where: { seller: { id: SHOP_ID } } }),
      );
    });

    it('filters by status when one is given', async () => {
      await service.shop(USER_ID, { status: 'approved' });

      expect(productFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { seller: { id: SHOP_ID }, approvalStatus: 'approved' },
        }),
      );
    });

    it('returns price as a number even though pg sends a string', async () => {
      productFind.mockResolvedValue([
        listing({ price: '250.50' as unknown as number }),
      ]);

      const { data } = await service.shop(USER_ID, {});

      expect(data[0].price).toBe(250.5);
    });

    it('shows why a listing was rejected', async () => {
      productFind.mockResolvedValue([
        listing({ approvalStatus: 'rejected', moderationNote: 'Blurry photo' }),
      ]);

      const { data } = await service.shop(USER_ID, {});

      expect(data[0]).toMatchObject({
        status: 'rejected',
        moderationNote: 'Blurry photo',
      });
    });
  });

  describe('me', () => {
    it('returns the account and the shop together', async () => {
      const { data } = await service.me(USER_ID);

      expect(data).toMatchObject({
        id: SHOP_ID,
        userId: USER_ID,
        email: 'ama@example.com',
        shopName: 'Makola Fabrics',
        location: { latitude: 5.575, longitude: -0.2 },
        verificationStatus: 'approved',
      });
    });

    it('never returns the password hash', async () => {
      userFindOne.mockResolvedValue({
        id: USER_ID,
        email: 'ama@example.com',
        passwordHash: '$2b$10$notreal',
      });

      const result = await service.me(USER_ID);

      expect(JSON.stringify(result)).not.toContain('$2b$');
    });
  });

  describe('addProduct', () => {
    it('lists the product as pending', async () => {
      await expect(service.addProduct(USER_ID, body)).resolves.toEqual({
        message: 'Product added. It is pending review.',
        data: { saved: true, id: 'new-id', status: 'pending' },
      });
    });

    it('writes it against this seller s shop', async () => {
      await service.addProduct(USER_ID, body);

      expect(productInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Kente cloth',
          price: 250,
          quantity: 4,
          tags: ['kente'],
          approvalStatus: 'pending',
          seller: { id: SHOP_ID },
        }),
      );
    });

    it('uploads the image and stores its url', async () => {
      await service.addProduct(USER_ID, body, image);

      expect(uploadImage).toHaveBeenCalledWith(image);
      expect(productInsert).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://cdn/pic.png' }),
      );
    });

    it('reuses an existing category rather than making a second one', async () => {
      await service.addProduct(USER_ID, body);

      expect(categorySave).not.toHaveBeenCalled();
    });

    it('creates the category when it is new', async () => {
      categoryGetOne.mockResolvedValue(null);
      categorySave.mockResolvedValue({ id: 'fresh', name: 'Beads' });

      await service.addProduct(USER_ID, { ...body, category: 'Beads' });

      expect(categorySave).toHaveBeenCalledWith({ name: 'Beads' });
    });

    it('moves the shop when coordinates come with the product', async () => {
      await service.addProduct(USER_ID, {
        ...body,
        latitude: 6.7,
        longitude: -1.62,
      });

      expect(sellerUpdate).toHaveBeenCalledWith(
        { id: SHOP_ID },
        { latitude: 6.7, longitude: -1.62 },
      );
    });

    it('leaves the shop where it is when they do not', async () => {
      await service.addProduct(USER_ID, body);

      expect(sellerUpdate).not.toHaveBeenCalled();
    });

    it('defaults to no tags', async () => {
      await service.addProduct(USER_ID, { ...body, tags: undefined });

      expect(productInsert).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [] }),
      );
    });

    it('rejects a file that is not an image, before writing', async () => {
      await expect(
        service.addProduct(USER_ID, body, {
          ...image,
          mimetype: 'application/pdf',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(productInsert).not.toHaveBeenCalled();
    });

    it('rejects anything over 5MB', async () => {
      await expect(
        service.addProduct(USER_ID, body, { ...image, size: 6 * 1024 * 1024 }),
      ).rejects.toThrow('under 5MB');
      expect(productInsert).not.toHaveBeenCalled();
    });

    it('writes nothing when the upload fails', async () => {
      uploadImage.mockRejectedValue(new Error('cloudinary is down'));

      await expect(service.addProduct(USER_ID, body, image)).rejects.toThrow(
        'could not be uploaded',
      );
      expect(productInsert).not.toHaveBeenCalled();
    });

    it('403s for an account with no shop', async () => {
      sellerFindOne.mockResolvedValue(null);

      await expect(service.addProduct(USER_ID, body)).rejects.toThrow(
        ForbiddenException,
      );
      expect(productInsert).not.toHaveBeenCalled();
    });
  });
});
