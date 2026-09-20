import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { ActivityService } from './activity.service';

const at = (iso: string) => new Date(iso);

describe('ActivityService.recent', () => {
  const userFind = jest.fn();
  const sellerFind = jest.fn();
  const productFind = jest.fn();
  let service: ActivityService;

  beforeEach(async () => {
    jest.clearAllMocks();
    userFind.mockResolvedValue([]);
    sellerFind.mockResolvedValue([]);
    productFind.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getRepositoryToken(User), useValue: { find: userFind } },
        { provide: getRepositoryToken(Seller), useValue: { find: sellerFind } },
        {
          provide: getRepositoryToken(Product),
          useValue: { find: productFind },
        },
      ],
    }).compile();

    service = module.get(ActivityService);
  });

  it('returns only a message and a time', async () => {
    userFind.mockResolvedValue([
      {
        email: 'kofi@example.com',
        role: 'buyer',
        createdAt: at('2026-09-18T10:00:00.000Z'),
      },
    ]);

    const [line] = await service.recent();

    expect(Object.keys(line).sort()).toEqual(['at', 'message']);
  });

  it('turns a new user into a sentence', async () => {
    userFind.mockResolvedValue([
      {
        email: 'kofi@example.com',
        role: 'buyer',
        createdAt: at('2026-09-18T10:00:00.000Z'),
      },
    ]);

    await expect(service.recent()).resolves.toEqual([
      {
        message: 'kofi@example.com joined as a buyer',
        at: '2026-09-18T10:00:00.000Z',
      },
    ]);
  });

  it('uses fullName once that column exists', async () => {
    userFind.mockResolvedValue([
      {
        email: 'kofi@example.com',
        fullName: 'Kofi Boateng',
        role: 'BUYER',
        createdAt: at('2026-09-18T10:00:00.000Z'),
      },
    ]);

    const [line] = await service.recent();

    expect(line.message).toBe('Kofi Boateng joined as a buyer');
  });

  it('lower-cases an uppercase role mid-sentence', async () => {
    userFind.mockResolvedValue([
      {
        email: 'ama@example.com',
        role: 'SELLER',
        createdAt: at('2026-09-18T10:00:00.000Z'),
      },
    ]);

    const [line] = await service.recent();

    expect(line.message).toBe('ama@example.com joined as a seller');
  });

  it('names the shop that listed a product', async () => {
    productFind.mockImplementation(({ where }: { where?: unknown }) =>
      where
        ? []
        : [
            {
              name: 'Kente cloth',
              seller: { shopName: 'Makola Fabrics' },
              createdAt: at('2026-09-18T12:00:00.000Z'),
            },
          ],
    );

    const [line] = await service.recent();

    expect(line.message).toBe('Kente cloth was listed by Makola Fabrics');
  });

  it('still reads if a listing has no seller', async () => {
    productFind.mockImplementation(({ where }: { where?: unknown }) =>
      where
        ? []
        : [{ name: 'Kente cloth', createdAt: at('2026-09-18T12:00:00.000Z') }],
    );

    const [line] = await service.recent();

    expect(line.message).toBe('Kente cloth was listed');
  });

  it('reports a moderation decision', async () => {
    productFind.mockImplementation(({ where }: { where?: unknown }) =>
      where
        ? [
            {
              name: 'Kente cloth',
              approvalStatus: 'approved',
              moderatedAt: at('2026-09-19T09:00:00.000Z'),
            },
          ]
        : [],
    );

    const [line] = await service.recent();

    expect(line).toEqual({
      message: 'Kente cloth was approved',
      at: '2026-09-19T09:00:00.000Z',
    });
  });

  it('interleaves every source, newest first', async () => {
    userFind.mockResolvedValue([
      {
        email: 'kofi@example.com',
        role: 'buyer',
        createdAt: at('2026-09-18T10:00:00.000Z'),
      },
    ]);
    sellerFind.mockResolvedValue([
      { shopName: 'Makola Fabrics', createdAt: at('2026-09-19T08:00:00.000Z') },
    ]);
    productFind.mockImplementation(({ where }: { where?: unknown }) =>
      where
        ? []
        : [
            {
              name: 'Kente cloth',
              seller: { shopName: 'Makola Fabrics' },
              createdAt: at('2026-09-17T07:00:00.000Z'),
            },
          ],
    );

    const feed = await service.recent();

    expect(feed.map((line) => line.message)).toEqual([
      'Makola Fabrics registered as a seller',
      'kofi@example.com joined as a buyer',
      'Kente cloth was listed by Makola Fabrics',
    ]);
  });

  it('caps the feed at ten lines', async () => {
    userFind.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        email: `user${i}@example.com`,
        role: 'buyer',
        createdAt: at('2026-09-18T10:00:00.000Z'),
      })),
    );
    sellerFind.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        shopName: `Shop ${i}`,
        createdAt: at('2026-09-19T10:00:00.000Z'),
      })),
    );

    await expect(service.recent()).resolves.toHaveLength(10);
  });

  it('is empty on an empty database', async () => {
    await expect(service.recent()).resolves.toEqual([]);
  });
});
