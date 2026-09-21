import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import { normaliseRole } from '../common/constants/domain';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';

/** One line of the dashboard's recent activity feed. */
export interface Activity {
  /** The whole sentence: an entity followed by what it did. */
  message: string;
  /** When it happened, as an ISO timestamp. */
  at: string;
}

/** How many lines the feed returns. */
const FEED_LENGTH = 10;

/**
 * The dashboard's recent activity feed.
 *
 * Nothing records events, so there is no activity table to read. Each line is
 * derived from a timestamp that already exists: a user's createdAt, a shop's
 * createdAt, a listing's createdAt and its moderatedAt. That covers things
 * being created and listings being moderated - it cannot show logins, edits or
 * deletions, because nothing writes those down.
 */
@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Seller)
    private readonly sellers: Repository<Seller>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  async recent(): Promise<Activity[]> {
    const [users, shops, listings, moderated] = await Promise.all([
      // No `select` here: the sentences use fullName once that column exists,
      // and naming it in a select would put it in the SQL and fail the query.
      this.users.find({ order: { createdAt: 'DESC' }, take: FEED_LENGTH }),
      this.sellers.find({ order: { createdAt: 'DESC' }, take: FEED_LENGTH }),
      this.products.find({
        relations: { seller: true },
        order: { createdAt: 'DESC' },
        take: FEED_LENGTH,
      }),
      this.products.find({
        where: { moderatedAt: Not(IsNull()) },
        order: { moderatedAt: 'DESC' },
        take: FEED_LENGTH,
      }),
    ]);

    return [
      ...users.map((user) =>
        this.line(
          this.nameFor(user),
          `joined as a ${this.article(user)}`,
          user.createdAt,
        ),
      ),
      ...shops.map((shop) =>
        this.line(shop.shopName, 'registered as a seller', shop.createdAt),
      ),
      ...listings.map((listing) =>
        this.line(
          listing.name,
          listing.seller?.shopName
            ? `was listed by ${listing.seller.shopName}`
            : 'was listed',
          listing.createdAt,
        ),
      ),
      ...moderated.map((listing) =>
        this.line(
          listing.name,
          `was ${listing.approvalStatus}`,
          listing.moderatedAt as Date,
        ),
      ),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, FEED_LENGTH);
  }

  private line(entity: string, action: string, at: Date): Activity {
    return { message: `${entity} ${action}`, at: at.toISOString() };
  }

  /** fullName once that column exists; the email is all there is until then. */
  private nameFor(user: User) {
    return user.fullName ?? user.email;
  }

  /** 'buyer' / 'seller' / 'admin', lower-cased for the middle of a sentence. */
  private article(user: User) {
    return (normaliseRole(user.role) ?? 'BUYER').toLowerCase();
  }
}
