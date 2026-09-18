import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { AdminService } from './admin.service';
import { DEFAULT_PAGE_SIZE } from './dto';
import { Report } from './entities/Reports.entity';

type MockRepo = {
  count: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  findAndCount: jest.Mock;
  update: jest.Mock;
};

const makeRepo = (): MockRepo => ({
  count: jest.fn().mockResolvedValue(0),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
});

// The options object a repository method was called with
type FindCall = {
  where?: unknown;
  select?: Record<string, boolean>;
  relations?: string[];
};

const callArg = (mock: jest.Mock, index = 0) =>
  (mock.mock.calls as FindCall[][])[index][0];

describe('AdminService', () => {
  let service: AdminService;
  let users: MockRepo;
  let sellers: MockRepo;
  let listings: MockRepo;
  let reports: MockRepo;

  beforeEach(async () => {
    users = makeRepo();
    sellers = makeRepo();
    listings = makeRepo();
    reports = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Seller), useValue: sellers },
        { provide: getRepositoryToken(Product), useValue: listings },
        { provide: getRepositoryToken(Report), useValue: reports },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('never exposes password hashes', () => {
    it('selects safe fields when listing users', async () => {
      await service.listUsers({});
      const { select } = callArg(users.findAndCount);

      expect(select?.passwordHash).toBeUndefined();
      expect(select).toMatchObject({ id: true, email: true, role: true });
    });

    it('selects safe fields when fetching one user', async () => {
      users.findOne.mockResolvedValue({ id: 'u1' });
      await service.getUser('u1');

      expect(callArg(users.findOne).select?.passwordHash).toBeUndefined();
    });

    it('selects safe fields for the user attached to a seller', async () => {
      sellers.findOne.mockResolvedValue({ id: 's1', userId: 'u1' });
      await service.getSeller('s1');

      expect(callArg(users.find).select?.passwordHash).toBeUndefined();
    });
  });

  describe('dashboard', () => {
    it('reports the headline counts', async () => {
      users.count
        .mockResolvedValueOnce(1200)
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(300);
      sellers.count.mockResolvedValueOnce(280).mockResolvedValueOnce(12);
      listings.count
        .mockResolvedValueOnce(865)
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(840);
      reports.count.mockResolvedValueOnce(4);

      const { data } = await service.getDashboard();

      expect(data.stats).toEqual({
        users: 1200,
        buyers: 900,
        sellerAccounts: 300,
        sellers: 280,
        pendingSellers: 12,
        listings: 865,
        pendingListings: 25,
        activeListings: 840,
        reports: 4,
      });
    });

    it('counts buyers under either spelling of the role', async () => {
      await service.getDashboard();

      expect(users.count).toHaveBeenCalledWith({
        where: { role: In(['BUYER', 'buyer']) },
      });
    });

    it('counts only pending reports', async () => {
      await service.getDashboard();

      expect(reports.count).toHaveBeenCalledWith({
        where: { status: 'pending' },
      });
    });

    it('returns recent listings and sellers, and no graph', async () => {
      const { data } = await service.getDashboard();

      expect(Object.keys(data)).toEqual(['stats', 'recent']);
      expect(Object.keys(data.recent)).toEqual(['listings', 'sellers']);
    });
  });

  describe('pagination', () => {
    it('defaults to page 1 and the default page size', async () => {
      await service.listUsers({});

      expect(users.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: DEFAULT_PAGE_SIZE }),
      );
    });

    it('skips the pages before the one requested', async () => {
      await service.listUsers({ page: 3, limit: 25 });

      expect(users.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 25 }),
      );
    });

    it('returns the total page count in meta', async () => {
      users.findAndCount.mockResolvedValue([[], 45]);

      const { meta } = await service.listUsers({ limit: 20 });

      expect(meta).toEqual({ total: 45, page: 1, limit: 20, pages: 3 });
    });
  });

  describe('user management', () => {
    it('filters by role, matching either spelling', async () => {
      await service.listUsers({ role: 'SELLER' });

      expect(callArg(users.findAndCount).where).toEqual({
        role: In(['SELLER', 'seller']),
      });
    });

    it('searches email and phone, keeping the role filter on both', async () => {
      await service.searchUsers({ q: ' 024 ', role: 'BUYER' });
      const where = callArg(users.findAndCount).where as Record<
        string,
        unknown
      >[];

      expect(where).toHaveLength(2);
      expect(where[0]).toHaveProperty('email');
      expect(where[1]).toHaveProperty('phone');
      expect(where.every((clause) => clause.role)).toBe(true);
    });

    it('rejects a status change for an unknown user', async () => {
      users.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.updateUserStatus('missing', 'suspended'),
      ).rejects.toThrow(NotFoundException);
    });

    it('stops an admin from changing their own status', async () => {
      await expect(
        service.updateUserStatus('a1', 'suspended', 'a1'),
      ).rejects.toThrow(BadRequestException);
      expect(users.update).not.toHaveBeenCalled();
    });

    it('returns the updated user after a status change', async () => {
      users.findOne.mockResolvedValue({ id: 'u1', status: 'suspended' });

      const result = await service.updateUserStatus('u1', 'suspended', 'a1');

      expect(users.update).toHaveBeenCalledWith('u1', { status: 'suspended' });
      expect(result).toEqual({
        message: 'User suspended',
        data: { id: 'u1', status: 'suspended' },
      });
    });
  });

  describe('buyer management', () => {
    it('lists only users with the BUYER role', async () => {
      await service.listBuyers({});

      expect(callArg(users.findAndCount).where).toEqual({
        role: In(['BUYER', 'buyer']),
      });
    });

    it('does not return a seller through the buyer endpoint', async () => {
      await expect(service.getBuyer('s1')).rejects.toThrow(NotFoundException);
      expect(callArg(users.findOne).where).toEqual({
        id: 's1',
        role: In(['BUYER', 'buyer']),
      });
    });
  });

  describe('seller management', () => {
    it("attaches each seller's user in a single query", async () => {
      sellers.findAndCount.mockResolvedValue([
        [
          { id: 's1', userId: 'u1' },
          { id: 's2', userId: 'u2' },
          { id: 's3', userId: 'u1' },
        ],
        3,
      ]);
      users.find.mockResolvedValue([
        { id: 'u1', email: 'a@x.com' },
        { id: 'u2', email: 'b@x.com' },
      ]);

      const { data } = await service.listSellers({});

      expect(users.find).toHaveBeenCalledTimes(1);
      expect(callArg(users.find).where).toEqual({ id: In(['u1', 'u2']) });
      expect(data.map((s) => s.user?.email)).toEqual([
        'a@x.com',
        'b@x.com',
        'a@x.com',
      ]);
    });

    it('leaves user null when the owning account is gone', async () => {
      sellers.findOne.mockResolvedValue({ id: 's1', userId: 'gone' });

      const { data } = await service.getSeller('s1');

      expect(data.user).toBeNull();
    });

    it('only lists pending sellers on the verification queue', async () => {
      await service.listPendingSellers({});

      expect(callArg(sellers.findAndCount).where).toEqual({
        verificationStatus: 'pending',
      });
    });

    it.each([
      ['approveSeller', 'approved'],
      ['rejectSeller', 'rejected'],
    ] as const)('%s sets verificationStatus %s', async (method, status) => {
      sellers.findOne.mockResolvedValue({ id: 's1', userId: 'u1' });

      const result = await service[method]('s1');

      expect(sellers.update).toHaveBeenCalledWith('s1', {
        verificationStatus: status,
      });
      expect(result.message).toBe(`Seller ${status}`);
    });

    it('404s when approving a seller that does not exist', async () => {
      sellers.update.mockResolvedValue({ affected: 0 });

      await expect(service.approveSeller('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listing management', () => {
    it('includes seller, category and subcategory', async () => {
      await service.listListings({});

      expect(callArg(listings.findAndCount).relations).toEqual([
        'seller',
        'category',
        'subcategory',
      ]);
    });

    it('only lists pending listings on the approval queue', async () => {
      await service.listPendingListings({});

      expect(callArg(listings.findAndCount).where).toEqual({
        approvalStatus: 'pending',
      });
    });

    it.each([
      ['approveListing', 'approved'],
      ['rejectListing', 'rejected'],
      ['removeListing', 'removed'],
    ] as const)('%s sets approvalStatus %s', async (method, status) => {
      listings.findOne.mockResolvedValue({ id: 'l1', approvalStatus: status });

      const result = await service[method]('l1');

      expect(listings.update).toHaveBeenCalledWith('l1', {
        approvalStatus: status,
      });
      expect(result.message).toBe(`Listing ${status}`);
    });
  });

  describe('report management', () => {
    it('filters by status when one is given', async () => {
      await service.listReports({ status: 'pending' });

      expect(callArg(reports.findAndCount).where).toEqual({
        status: 'pending',
      });
    });

    it('returns every status when none is given', async () => {
      await service.listReports({});

      expect(callArg(reports.findAndCount).where).toBeUndefined();
    });

    it.each([
      ['resolveReport', 'resolved'],
      ['dismissReport', 'dismissed'],
    ] as const)(
      '%s records who reviewed it and when',
      async (method, status) => {
        reports.findOne.mockResolvedValue({
          id: 'r1',
          reporterId: 'u1',
          status,
        });

        const result = await service[method]('r1', 'admin-1');
        const [, patch] = reports.update.mock.calls[0] as [
          string,
          { status: string; reviewedBy: string; reviewedAt: Date },
        ];

        expect(patch.status).toBe(status);
        expect(patch.reviewedBy).toBe('admin-1');
        expect(patch.reviewedAt).toBeInstanceOf(Date);
        expect(result.message).toBe(`Report ${status}`);
      },
    );
  });
});
