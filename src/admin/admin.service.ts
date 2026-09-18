import {
  BadRequestException,
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
  ListReportsDto,
  ListUsersDto,
  PaginationDto,
  SearchUsersDto,
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

function roleFilter(role?: UserRole): FindOptionsWhere<User> {
  return role ? { role: In(roleVariants(role)) } : {};
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
      this.users.count({ where: roleFilter('BUYER') }),
      this.users.count({ where: roleFilter('SELLER') }),
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

  listUsers({ role, ...pagination }: ListUsersDto) {
    return this.page(this.users, pagination, 'Users retrieved', {
      where: roleFilter(role),
      select: SAFE_USER_FIELDS,
    });
  }

  searchUsers({ q, role, ...pagination }: SearchUsersDto) {
    const search = q.trim();
    const term = ILike(`%${search}%`);

    // An array of where-clauses is OR'd, so the role filter goes in each one
    const where: FindOptionsWhere<User>[] = [
      { email: term, ...roleFilter(role) },
      { phone: term, ...roleFilter(role) },
    ];

    return this.page(this.users, pagination, `Users matching "${search}"`, {
      where,
      select: SAFE_USER_FIELDS,
    });
  }

  async getUser(id: string) {
    return {
      message: 'User retrieved',
      data: await this.findUserOrFail({ id }, 'User', id),
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
  // Buyers are users with the BUYER role. These are the user reads with that
  // filter pre-applied, which keeps the Admin Web's Users -> Buyers page to a
  // single call.

  listBuyers(pagination: PaginationDto) {
    return this.page(this.users, pagination, 'Buyers retrieved', {
      where: roleFilter('BUYER'),
      select: SAFE_USER_FIELDS,
    });
  }

  async getBuyer(id: string) {
    return {
      message: 'Buyer retrieved',
      data: await this.findUserOrFail(
        { id, ...roleFilter('BUYER') },
        'Buyer',
        id,
      ),
    };
  }

  // Seller Management

  async listSellers(pagination: PaginationDto) {
    const result = await this.page(
      this.sellers,
      pagination,
      'Sellers retrieved',
    );
    return { ...result, data: await this.withUsers(result.data) };
  }

  async listPendingSellers(pagination: PaginationDto) {
    const result = await this.page(
      this.sellers,
      pagination,
      'Pending sellers retrieved',
      { where: { verificationStatus: 'pending' } },
    );
    return { ...result, data: await this.withUsers(result.data) };
  }

  async getSeller(id: string) {
    const seller = await this.findOrFail(this.sellers, id, 'Seller');
    const [withUser] = await this.withUsers([seller]);

    return { message: 'Seller retrieved', data: withUser };
  }

  approveSeller(id: string) {
    return this.sellerVerification(id, 'approved');
  }

  rejectSeller(id: string) {
    return this.sellerVerification(id, 'rejected');
  }

  // Listing Management

  listListings(pagination: PaginationDto) {
    return this.page(this.listings, pagination, 'Listings retrieved', {
      relations: LISTING_RELATIONS,
    });
  }

  listPendingListings(pagination: PaginationDto) {
    return this.page(this.listings, pagination, 'Pending listings retrieved', {
      where: { approvalStatus: 'pending' },
      relations: LISTING_RELATIONS,
    });
  }

  async getListing(id: string) {
    return {
      message: 'Listing retrieved',
      data: await this.findOrFail(
        this.listings,
        id,
        'Listing',
        LISTING_RELATIONS,
      ),
    };
  }

  approveListing(id: string) {
    return this.listingApproval(id, 'approved');
  }

  rejectListing(id: string) {
    return this.listingApproval(id, 'rejected');
  }

  removeListing(id: string) {
    return this.listingApproval(id, 'removed');
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

  private async sellerVerification(
    id: string,
    status: SellerVerificationStatus,
  ) {
    await this.updateOrFail(
      this.sellers,
      id,
      { verificationStatus: status },
      'Seller',
    );
    return this.getSeller(id).then(({ data }) => ({
      message: `Seller ${status}`,
      data,
    }));
  }

  private async listingApproval(id: string, status: ListingApprovalStatus) {
    await this.updateOrFail(
      this.listings,
      id,
      { approvalStatus: status },
      'Listing',
    );
    return {
      message: `Listing ${status}`,
      data: await this.findOrFail(
        this.listings,
        id,
        'Listing',
        LISTING_RELATIONS,
      ),
    };
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
