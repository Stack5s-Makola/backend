import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { ActivityService } from './activity.service';
import { DashboardService } from './dashboard.service';

const FEED = [
  {
    message: 'Makola Fabrics registered as a seller',
    at: '2026-09-19T08:00:00.000Z',
  },
];

describe('DashboardService.totals', () => {
  const userCount = jest.fn();
  const productCount = jest.fn();
  const recent = jest.fn();
  let service: DashboardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    recent.mockResolvedValue(FEED);

    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(User), useValue: { count: userCount } },
        {
          provide: getRepositoryToken(Product),
          useValue: { count: productCount },
        },
        { provide: ActivityService, useValue: { recent } },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  it('returns the four totals', async () => {
    // total, sellers, buyers - in the order totals() awaits them
    userCount
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(27);
    productCount.mockResolvedValue(93);

    await expect(service.totals()).resolves.toEqual({
      message: 'Dashboard totals retrieved',
      data: {
        totalUsers: 40,
        totalSellers: 12,
        totalBuyers: 27,
        totalListings: 93,
        recentActivities: FEED,
      },
    });
  });

  it('counts both spellings of a role', async () => {
    userCount.mockResolvedValue(0);
    productCount.mockResolvedValue(0);

    await service.totals();

    expect(userCount).toHaveBeenNthCalledWith(2, {
      where: { role: In(['SELLER', 'seller']) },
    });
    expect(userCount).toHaveBeenNthCalledWith(3, {
      where: { role: In(['BUYER', 'buyer']) },
    });
  });

  it('counts every listing, whatever its approval state', async () => {
    userCount.mockResolvedValue(0);
    productCount.mockResolvedValue(5);

    await service.totals();

    expect(productCount).toHaveBeenCalledWith();
  });

  it('reports zeroes on an empty database', async () => {
    userCount.mockResolvedValue(0);
    productCount.mockResolvedValue(0);

    const { data } = await service.totals();

    expect(data).toEqual({
      totalUsers: 0,
      totalSellers: 0,
      totalBuyers: 0,
      totalListings: 0,
      recentActivities: FEED,
    });
  });
});
