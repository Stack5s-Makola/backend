import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ILike, In } from 'typeorm';
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

  describe('user management (week 2)', () => {
    it('filters by status', async () => {
      await service.listUsers({ status: 'suspended' });

      expect(callArg(users.findAndCount).where).toEqual({
        status: 'suspended',
      });
    });

    it('combines role and status', async () => {
      await service.listUsers({ role: 'BUYER', status: 'active' });

      expect(callArg(users.findAndCount).where).toEqual({
        role: In(['BUYER', 'buyer']),
        status: 'active',
      });
    });

    it('includes the seller profile on the user detail', async () => {
      users.findOne.mockResolvedValue({ id: 'u1' });
      sellers.findOne.mockResolvedValue({ id: 's1', shopName: 'Kwame' });

      const { data } = await service.getUser('u1');

      expect(sellers.findOne).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(data.sellerProfile).toEqual({ id: 's1', shopName: 'Kwame' });
    });

    it('returns a null seller profile for a buyer', async () => {
      users.findOne.mockResolvedValue({ id: 'u1' });

      const { data } = await service.getUser('u1');

      expect(data.sellerProfile).toBeNull();
    });

    it('soft-deletes by setting status to deleted', async () => {
      users.findOne.mockResolvedValue({ id: 'u1', status: 'deleted' });

      const result = await service.updateUserStatus('u1', 'deleted', 'a1');

      expect(users.update).toHaveBeenCalledWith('u1', { status: 'deleted' });
      expect(result.message).toBe('User deleted');
    });
  });

  describe('buyer management', () => {
    it('filters buyers by status', async () => {
      await service.listBuyers({ status: 'suspended' });

      expect(callArg(users.findAndCount).where).toEqual({
        role: In(['BUYER', 'buyer']),
        status: 'suspended',
      });
    });

    it('searches only buyers', async () => {
      await service.searchBuyers({ q: 'ama' });
      const where = callArg(users.findAndCount).where as Record<
        string,
        unknown
      >[];

      expect(where).toHaveLength(2);
      expect(
        where.every((clause) => {
          const role = clause.role as ReturnType<typeof In>;
          return (
            JSON.stringify(role) === JSON.stringify(In(['BUYER', 'buyer']))
          );
        }),
      ).toBe(true);
    });

    it('suspends a buyer', async () => {
      users.findOne.mockResolvedValue({ id: 'b1', status: 'suspended' });

      const result = await service.updateBuyerStatus('b1', 'suspended', 'a1');

      expect(users.update).toHaveBeenCalledWith('b1', { status: 'suspended' });
      expect(result.message).toBe('Buyer suspended');
    });

    it('will not change the status of a non-buyer through the buyer route', async () => {
      await expect(
        service.updateBuyerStatus('s1', 'suspended', 'a1'),
      ).rejects.toThrow(NotFoundException);
      expect(users.update).not.toHaveBeenCalled();
    });

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

  describe('seller management (week 2)', () => {
    it('filters by verification status and shop name', async () => {
      await service.listSellers({ verificationStatus: 'approved', q: ' kwa ' });

      expect(callArg(sellers.findAndCount).where).toEqual({
        verificationStatus: 'approved',
        shopName: ILike('%kwa%'),
      });
    });

    it("breaks the seller's listings down by status", async () => {
      sellers.findOne.mockResolvedValue({ id: 's1', userId: 'u1' });
      listings.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      const { data } = await service.getSeller('s1');

      expect(data.listings).toEqual({
        total: 10,
        pending: 2,
        approved: 6,
        rejected: 1,
        removed: 1,
      });
    });

    it('409s when approving a seller that is already approved', async () => {
      sellers.findOne.mockResolvedValue({
        id: 's1',
        verificationStatus: 'approved',
      });

      await expect(service.approveSeller('s1')).rejects.toThrow(
        new ConflictException('Seller is already approved'),
      );
      expect(sellers.update).not.toHaveBeenCalled();
    });

    it('allows revoking an approved seller', async () => {
      sellers.findOne.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        verificationStatus: 'approved',
      });

      const result = await service.rejectSeller('s1');

      expect(sellers.update).toHaveBeenCalledWith('s1', {
        verificationStatus: 'rejected',
      });
      expect(result.message).toBe('Seller rejected');
    });

    it('suspends the account behind a seller', async () => {
      sellers.findOne.mockResolvedValue({ id: 's1', userId: 'u1' });
      users.findOne.mockResolvedValue({ id: 'u1', status: 'suspended' });

      const result = await service.updateSellerStatus('s1', 'suspended', 'a1');

      expect(users.update).toHaveBeenCalledWith('u1', { status: 'suspended' });
      expect(sellers.update).not.toHaveBeenCalled();
      expect(result.message).toBe('Seller suspended');
    });

    it('404s suspending a seller that does not exist', async () => {
      await expect(
        service.updateSellerStatus('nope', 'suspended', 'a1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('stops an admin suspending their own seller profile', async () => {
      sellers.findOne.mockResolvedValue({ id: 's1', userId: 'a1' });

      await expect(
        service.updateSellerStatus('s1', 'suspended', 'a1'),
      ).rejects.toThrow(BadRequestException);
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

    it('combines status, seller, category and name filters', async () => {
      await service.listListings({
        status: 'approved',
        sellerId: 's1',
        categoryId: 'c1',
        q: ' kente ',
      });

      expect(callArg(listings.findAndCount).where).toEqual({
        approvalStatus: 'approved',
        seller: { id: 's1' },
        category: { id: 'c1' },
        name: ILike('%kente%'),
      });
    });

    it("attaches the seller's account on the listing detail", async () => {
      listings.findOne.mockResolvedValue({
        id: 'l1',
        seller: { id: 's1', userId: 'u1' },
      });
      users.find.mockResolvedValue([{ id: 'u1', email: 'a@x.com' }]);

      const { data } = await service.getListing('l1');

      expect((data.seller as { user?: { email: string } }).user?.email).toBe(
        'a@x.com',
      );
    });

    describe('moderation transitions', () => {
      it.each([
        ['approveListing', 'pending', 'approved'],
        ['approveListing', 'rejected', 'approved'],
        ['approveListing', 'removed', 'approved'],
        ['rejectListing', 'pending', 'rejected'],
        ['removeListing', 'approved', 'removed'],
      ] as const)('%s moves %s -> %s', async (method, from, to) => {
        listings.findOne.mockResolvedValue({ id: 'l1', approvalStatus: from });

        const result = await service[method]('l1', 'admin-1');
        const [, patch] = listings.update.mock.calls[0] as [
          string,
          { approvalStatus: string; moderatedBy: string; moderatedAt: Date },
        ];

        expect(patch.approvalStatus).toBe(to);
        expect(patch.moderatedBy).toBe('admin-1');
        expect(patch.moderatedAt).toBeInstanceOf(Date);
        expect(result.message).toBe(`Listing ${to}`);
      });

      it.each([
        [
          'rejectListing',
          'approved',
          'Cannot reject a listing that is approved',
        ],
        ['rejectListing', 'removed', 'Cannot reject a listing that is removed'],
        ['removeListing', 'pending', 'Cannot remove a listing that is pending'],
        [
          'removeListing',
          'rejected',
          'Cannot remove a listing that is rejected',
        ],
      ] as const)('%s refuses from %s', async (method, from, message) => {
        listings.findOne.mockResolvedValue({ id: 'l1', approvalStatus: from });

        await expect(service[method]('l1')).rejects.toThrow(
          new ConflictException(message),
        );
        expect(listings.update).not.toHaveBeenCalled();
      });

      it.each([
        ['approveListing', 'approved'],
        ['rejectListing', 'rejected'],
        ['removeListing', 'removed'],
      ] as const)(
        '%s on a listing already %s is a 409',
        async (method, status) => {
          listings.findOne.mockResolvedValue({
            id: 'l1',
            approvalStatus: status,
          });

          await expect(service[method]('l1')).rejects.toThrow(
            new ConflictException(`Listing is already ${status}`),
          );
        },
      );

      it('404s for a listing that does not exist', async () => {
        await expect(service.approveListing('nope')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('stores a trimmed reason on reject', async () => {
        listings.findOne.mockResolvedValue({
          id: 'l1',
          approvalStatus: 'pending',
        });

        await service.rejectListing('l1', 'admin-1', '  blurry photos  ');

        expect(listings.update).toHaveBeenCalledWith(
          'l1',
          expect.objectContaining({ moderationNote: 'blurry photos' }),
        );
      });

      it('stores null for a blank reason', async () => {
        listings.findOne.mockResolvedValue({
          id: 'l1',
          approvalStatus: 'approved',
        });

        await service.removeListing('l1', 'admin-1', '   ');

        expect(listings.update).toHaveBeenCalledWith(
          'l1',
          expect.objectContaining({ moderationNote: null }),
        );
      });

      it('clears the note when a listing is approved', async () => {
        listings.findOne.mockResolvedValue({
          id: 'l1',
          approvalStatus: 'rejected',
        });

        await service.approveListing('l1', 'admin-1');

        expect(listings.update).toHaveBeenCalledWith(
          'l1',
          expect.objectContaining({ moderationNote: null }),
        );
      });
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
