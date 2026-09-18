import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsOrder,
  FindOptionsSelect,
  FindOptionsWhere,
  ILike,
  In,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import {
  LISTING_TRANSITIONS,
  ListingApprovalStatus,
  ReportStatus,
  SellerVerificationStatus,
  UserRole,
  UserStatus,
  roleVariants,
} from '../common/constants/domain';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import {
  DEFAULT_PAGE_SIZE,
  ListListingsDto,
  ListReportsDto,
  ListSellersDto,
  ListUsersDto,
  PaginationDto,
  SearchBuyersDto,
  SearchUsersDto,
  UserStatusFilterDto,
} from './dto';
import { Report } from './entities/Reports.entity';

const RECENT_LIMIT = 10;

// Every user read goes through this so the password hash never leaves the API
const SAFE_USER_FIELDS: FindOptionsSelect<User> = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const LISTING_RELATIONS = ['seller', 'category', 'subcategory'];

// The verb used in messages for each moderation target state
const MODERATION_VERB: Record<keyof typeof LISTING_TRANSITIONS, string> = {
  approved: 'approve',
  rejected: 'reject',
  removed: 'remove',
};

type Timestamped = ObjectLiteral & { id: string; createdAt: Date };
type SafeUser = Omit<User, 'passwordHash'>;

type FindOptions<T> = {
  where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
  relations?: string[];
  select?: FindOptionsSelect<T>;
};

// ?page= and ?limit= arrive already validated, so only defaults are applied here
function paging({ page = 1, limit = DEFAULT_PAGE_SIZE }: PaginationDto) {
  return { page, limit, skip: (page - 1) * limit };
}

// The shared account filters: optional role (either spelling) and status
function userFilter(role?: UserRole, status?: UserStatus) {
  const where: FindOptionsWhere<User> = {};
  if (role) where.role = In(roleVariants(role));
  if (status) where.status = status;
  return where;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Seller)
    private readonly sellers: Repository<Seller>,
    @InjectRepository(Product)
    private readonly listings: Repository<Product>,
    @InjectRepository(Report)
    private readonly reports: Repository<Report>,
  ) {}

  // Dashboard

  async getDashboard() {
    const [
      users,
      buyers,
      sellerAccounts,
      sellers,
      pendingSellers,
      listings,
      pendingListings,
      activeListings,
      reports,
      recentListings,
      recentSellers,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ where: userFilter('BUYER') }),
      this.users.count({ where: userFilter('SELLER') }),
      this.sellers.count(),
      this.sellers.count({ where: { verificationStatus: 'pending' } }),
      this.listings.count(),
      this.listings.count({ where: { approvalStatus: 'pending' } }),
      this.listings.count({ where: { approvalStatus: 'approved' } }),
      this.reports.count({ where: { status: 'pending' } }),
      this.listings.find({
        relations: LISTING_RELATIONS,
        order: { createdAt: 'DESC' },
        take: RECENT_LIMIT,
      }),
      this.sellers.find({ order: { createdAt: 'DESC' }, take: RECENT_LIMIT }),
    ]);

    return {
      message: 'Dashboard retrieved',
      data: {
        stats: {
          users,
          buyers,
          sellerAccounts,
          sellers,
          pendingSellers,
          listings,
          pendingListings,
          activeListings,
          reports,
        },
        recent: {
          listings: recentListings,
          sellers: await this.withUsers(recentSellers),
        },
      },
    };
  }

  // User Management

  listUsers({ role, status, ...pagination }: ListUsersDto) {
    return this.page(this.users, pagination, 'Users retrieved', {
      where: userFilter(role, status),
      select: SAFE_USER_FIELDS,
    });
  }

  searchUsers({ q, role, status, ...pagination }: SearchUsersDto) {
    return this.searchAccounts(q, pagination, userFilter(role, status));
  }

  /** A user, plus their seller profile when they have one. */
  async getUser(id: string) {
    const user = await this.findUserOrFail({ id }, 'User', id);
    const sellerProfile = await this.sellers.findOne({ where: { userId: id } });

    return {
      message: 'User retrieved',
      data: { ...user, sellerProfile: sellerProfile ?? null },
    };
  }

  async updateUserStatus(id: string, status: UserStatus, adminId?: string) {
    // An admin suspending themselves would lock the last way back in
    if (adminId && id === adminId) {
      throw new BadRequestException('You cannot change your own status');
    }

    await this.updateOrFail(this.users, id, { status }, 'User');

    return {
      message: `User ${status}`,
      data: await this.findUserOrFail({ id }, 'User', id),
    };
  }

  // Buyer Management
  //
  // Buyers are users with the BUYER role. These are the user operations with
  // that filter pre-applied, so an id that belongs to a seller or admin is a
  // 404 here rather than silently acting on the wrong kind of account.

  listBuyers({ status, ...pagination }: UserStatusFilterDto) {
    return this.page(this.users, pagination, 'Buyers retrieved', {
      where: userFilter('BUYER', status),
      select: SAFE_USER_FIELDS,
    });
  }

  searchBuyers({ q, status, ...pagination }: SearchBuyersDto) {
    return this.searchAccounts(q, pagination, userFilter('BUYER', status));
  }

  async getBuyer(id: string) {
    return {
      message: 'Buyer retrieved',
      data: await this.findBuyerOrFail(id),
    };
  }

  async updateBuyerStatus(id: string, status: UserStatus, adminId?: string) {
    await this.findBuyerOrFail(id);
    const { data } = await this.updateUserStatus(id, status, adminId);

    return { message: `Buyer ${status}`, data };
  }

  // Seller Management

  async listSellers({ verificationStatus, q, ...pagination }: ListSellersDto) {
    const where: FindOptionsWhere<Seller> = {};
    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (q?.trim()) where.shopName = ILike(`%${q.trim()}%`);

    const result = await this.page(
      this.sellers,
      pagination,
      'Sellers retrieved',
      { where },
    );
    return { ...result, data: await this.withUsers(result.data) };
  }

  listPendingSellers(pagination: PaginationDto) {
    return this.listSellers({
      ...pagination,
      verificationStatus: 'pending',
    }).then((result) => ({ ...result, message: 'Pending sellers retrieved' }));
  }

  /** A seller with its owning account and a breakdown of its listings. */
  async getSeller(id: string) {
    const seller = await this.findOrFail(this.sellers, id, 'Seller');
    const [[withUser], listings] = await Promise.all([
      this.withUsers([seller]),
      this.listingCounts(id),
    ]);

    return { message: 'Seller retrieved', data: { ...withUser, listings } };
  }

  approveSeller(id: string) {
    return this.sellerVerification(id, 'approved');
  }

  rejectSeller(id: string) {
    return this.sellerVerification(id, 'rejected');
  }

  /**
   * Suspends or reinstates the account behind a seller profile. The profile's
   * verification is untouched, so reinstating does not need re-approval.
   */
  async updateSellerStatus(id: string, status: UserStatus, adminId?: string) {
    const seller = await this.findOrFail(this.sellers, id, 'Seller');

    if (!seller.userId) {
      throw new NotFoundException(`Seller ${id} has no linked account`);
    }

    await this.updateUserStatus(seller.userId, status, adminId);
    const { data } = await this.getSeller(id);

    return { message: `Seller ${status}`, data };
  }

  // Listing Management

  listListings({
    status,
    sellerId,
    categoryId,
    q,
    ...pagination
  }: ListListingsDto) {
    const where: FindOptionsWhere<Product> = {};
    if (status) where.approvalStatus = status;
    if (sellerId) where.seller = { id: sellerId };
    if (categoryId) where.category = { id: categoryId };
    if (q?.trim()) where.name = ILike(`%${q.trim()}%`);

    return this.page(this.listings, pagination, 'Listings retrieved', {
      where,
      relations: LISTING_RELATIONS,
    });
  }

  listPendingListings(pagination: PaginationDto) {
    return this.page(this.listings, pagination, 'Pending listings retrieved', {
      where: { approvalStatus: 'pending' },
      relations: LISTING_RELATIONS,
    });
  }

  /** A listing, with its seller's owning account attached to the seller. */
  async getListing(id: string) {
    return {
      message: 'Listing retrieved',
      data: await this.listingWithOwner(id),
    };
  }

  approveListing(id: string, adminId?: string) {
    return this.moderateListing(id, 'approved', adminId);
  }

  rejectListing(id: string, adminId?: string, reason?: string) {
    return this.moderateListing(id, 'rejected', adminId, reason);
  }

  removeListing(id: string, adminId?: string, reason?: string) {
    return this.moderateListing(id, 'removed', adminId, reason);
  }

  // Report Management

  async listReports({ status, ...pagination }: ListReportsDto) {
    const result = await this.page(
      this.reports,
      pagination,
      'Reports retrieved',
      {
        where: status ? { status } : undefined,
      },
    );
    return { ...result, data: await this.withReporters(result.data) };
  }

  resolveReport(id: string, adminId?: string) {
    return this.reviewReport(id, 'resolved', adminId);
  }

  dismissReport(id: string, adminId?: string) {
    return this.reviewReport(id, 'dismissed', adminId);
  }

  // Helpers

  // An array of where-clauses is OR'd, so the filters go in each one
  private searchAccounts(
    q: string,
    pagination: PaginationDto,
    filter: FindOptionsWhere<User>,
  ) {
    const search = q.trim();
    const term = ILike(`%${search}%`);

    return this.page(this.users, pagination, `Users matching "${search}"`, {
      where: [
        { email: term, ...filter },
        { phone: term, ...filter },
      ],
      select: SAFE_USER_FIELDS,
    });
  }

  private findBuyerOrFail(id: string) {
    return this.findUserOrFail({ id, ...userFilter('BUYER') }, 'Buyer', id);
  }

  private async sellerVerification(
    id: string,
    status: SellerVerificationStatus,
  ) {
    const seller = await this.findOrFail(this.sellers, id, 'Seller');

    if (seller.verificationStatus === status) {
      throw new ConflictException(`Seller is already ${status}`);
    }

    await this.sellers.update(id, { verificationStatus: status });
    const { data } = await this.getSeller(id);

    return { message: `Seller ${status}`, data };
  }

  /**
   * Moves a listing through the approval flow, refusing moves the flow does
   * not allow (see LISTING_TRANSITIONS) with a 409 that names the problem.
   */
  private async moderateListing(
    id: string,
    target: keyof typeof LISTING_TRANSITIONS,
    adminId?: string,
    reason?: string,
  ) {
    const listing = await this.findOrFail(this.listings, id, 'Listing');
    const current = listing.approvalStatus;

    if (current === target) {
      throw new ConflictException(`Listing is already ${target}`);
    }

    if (!LISTING_TRANSITIONS[target].includes(current)) {
      throw new ConflictException(
        `Cannot ${MODERATION_VERB[target]} a listing that is ${current}`,
      );
    }

    await this.listings.update(id, {
      approvalStatus: target,
      // Approval clears any earlier rejection note
      moderationNote: target === 'approved' ? null : reason?.trim() || null,
      moderatedBy: adminId ?? null,
      moderatedAt: new Date(),
    });

    return {
      message: `Listing ${target}`,
      data: await this.listingWithOwner(id),
    };
  }

  private async listingWithOwner(id: string) {
    const listing = await this.findOrFail(
      this.listings,
      id,
      'Listing',
      LISTING_RELATIONS,
    );

    if (!listing.seller) {
      return listing;
    }

    const [seller] = await this.withUsers([listing.seller]);
    return { ...listing, seller };
  }

  private async listingCounts(sellerId: string) {
    const bySeller = { seller: { id: sellerId } };
    const statuses: ListingApprovalStatus[] = [
      'pending',
      'approved',
      'rejected',
      'removed',
    ];

    const [total, ...perStatus] = await Promise.all([
      this.listings.count({ where: bySeller }),
      ...statuses.map((approvalStatus) =>
        this.listings.count({ where: { ...bySeller, approvalStatus } }),
      ),
    ]);

    return {
      total,
      ...Object.fromEntries(statuses.map((s, i) => [s, perStatus[i]])),
    } as Record<'total' | ListingApprovalStatus, number>;
  }

  private async reviewReport(
    id: string,
    status: ReportStatus,
    adminId?: string,
  ) {
    await this.updateOrFail(
      this.reports,
      id,
      { status, reviewedBy: adminId ?? null, reviewedAt: new Date() },
      'Report',
    );

    const report = await this.findOrFail(this.reports, id, 'Report');
    const [withReporter] = await this.withReporters([report]);

    return { message: `Report ${status}`, data: withReporter };
  }

  // Seller only stores userId, so the owning users are fetched in one query
  private async withUsers(sellers: Seller[]) {
    const owners = await this.usersById(sellers.map((seller) => seller.userId));
    return sellers.map((seller) => ({
      ...seller,
      user: owners.get(seller.userId) ?? null,
    }));
  }

  private async withReporters(reports: Report[]) {
    const reporters = await this.usersById(reports.map((r) => r.reporterId));
    return reports.map((report) => ({
      ...report,
      reporter: reporters.get(report.reporterId) ?? null,
    }));
  }

  private async usersById(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) {
      return new Map<string, SafeUser>();
    }

    const found = await this.users.find({
      where: { id: In(unique) },
      select: SAFE_USER_FIELDS,
    });

    return new Map<string, SafeUser>(found.map((user) => [user.id, user]));
  }

  private async findUserOrFail(
    where: FindOptionsWhere<User>,
    label: string,
    id: string,
  ): Promise<SafeUser> {
    const user = await this.users.findOne({ where, select: SAFE_USER_FIELDS });

    if (!user) {
      throw new NotFoundException(`${label} ${id} not found`);
    }

    return user;
  }

  // One page of rows, newest first
  private async page<T extends Timestamped>(
    repo: Repository<T>,
    pagination: PaginationDto,
    message: string,
    options: FindOptions<T> = {},
  ) {
    const { page, limit, skip } = paging(pagination);
    const [data, total] = await repo.findAndCount({
      ...options,
      order: { createdAt: 'DESC' } as FindOptionsOrder<T>,
      skip,
      take: limit,
    });

    return {
      message,
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  private async findOrFail<T extends Timestamped>(
    repo: Repository<T>,
    id: string,
    label: string,
    relations: string[] = [],
  ) {
    const found = await repo.findOne({
      where: { id } as FindOptionsWhere<T>,
      relations,
    });

    if (!found) {
      throw new NotFoundException(`${label} ${id} not found`);
    }

    return found;
  }

  private async updateOrFail<T extends Timestamped>(
    repo: Repository<T>,
    id: string,
    patch: Partial<T>,
    label: string,
  ) {
    const { affected } = await repo.update(id, patch);

    if (!affected) {
      throw new NotFoundException(`${label} ${id} not found`);
    }
  }
}
