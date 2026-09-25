import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ListingApprovalStatus } from '../common/constants/domain';
import { NotificationsService } from '../notifications/notifications.service';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';

/** One row of the admin listings table. */
export interface ListingRow {
  id: string;
  /** The product's own name. */
  product: string;
  /** The shop it belongs to, or null if the row points at no seller. */
  seller: string | null;
  /** The seller's coordinates - a listing has no location of its own. */
  location: { latitude: number; longitude: number } | null;
  /** When it was listed, as an ISO timestamp. */
  date: string;
  /** pending | approved | rejected | removed */
  status: ListingApprovalStatus;
  /** The listing's photo, or null when the seller listed without one. */
  image: string | null;
}

/** Everything the admin listing page shows about one product. */
export interface ListingDetail extends ListingRow {
  price: number;
  quantity: number;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  /** Why an admin rejected or removed it. Cleared on approval. */
  moderationNote: string | null;
  /** Which admin last acted on it, and when. Null for the super admin. */
  moderatedBy: string | null;
  moderatedAt: string | null;
  updatedAt: string;
  /** The shop, and the person behind it. */
  shop: {
    id: string;
    shopName: string;
    logo: string | null;
    location: { latitude: number; longitude: number } | null;
    verificationStatus: string;
    locationName: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    ownerPhone: string | null;
    isEmailVerified: boolean;
  } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Seller)
    private readonly sellers: Repository<Seller>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * One listing in full, for the admin's product page.
   *
   * Carries the shop and the person behind it, so the page can decide on a
   * listing without a second call for the seller.
   */
  async detail(id: string): Promise<{ message: string; data: ListingDetail }> {
    const listing = await this.products.findOne({
      where: { id },
      relations: { seller: true, category: true, subcategory: true },
    });

    if (!listing) {
      throw new NotFoundException('No listing found for that id');
    }

    const owner = await this.ownerOf(listing.seller);

    return {
      message: 'Listing retrieved',
      data: {
        ...this.toRow(listing),
        // numeric columns come back from pg as strings
        price: Number(listing.price),
        quantity: listing.quantity,
        category: listing.category?.name ?? null,
        subcategory: listing.subcategory?.name ?? null,
        tags: listing.tags ?? [],
        moderationNote: listing.moderationNote ?? null,
        moderatedBy: listing.moderatedBy ?? null,
        moderatedAt: listing.moderatedAt?.toISOString() ?? null,
        updatedAt: listing.updatedAt.toISOString(),
        shop: listing.seller
          ? {
              id: listing.seller.id,
              shopName: listing.seller.shopName,
              logo: listing.seller.logoUrl ?? null,
              location: this.location(listing),
              verificationStatus: listing.seller.verificationStatus,
              locationName: listing.seller.locationName ?? null,
              ownerName: owner?.fullName ?? null,
              ownerEmail: owner?.email ?? null,
              ownerPhone: owner?.phone ?? null,
              isEmailVerified: owner?.emailVerified ?? false,
            }
          : null,
      },
    };
  }

  /**
   * The account behind a shop.
   *
   * `sellers.userId` is a varchar while `users.id` is a uuid, so anything
   * that is not a uuid is skipped rather than failing the query.
   */
  private async ownerOf(shop?: Seller | null) {
    if (!shop?.userId || !UUID.test(shop.userId)) {
      return null;
    }

    return this.users.findOne({ where: { id: shop.userId } });
  }

  /**
   * Approves a listing, so buyers can finally see it.
   *
   * Approving an already approved one is a no-op rather than an error: an
   * admin double-tapping a button should not get a failure.
   *
   * The moderation note is cleared, because it explained a rejection that no
   * longer applies.
   */
  async approve(id: string, adminId: string) {
    const listing = await this.products.findOne({
      where: { id },
      relations: { seller: true },
    });

    if (!listing) {
      throw new NotFoundException('No listing found for that id');
    }

    if (listing.approvalStatus === 'approved') {
      return {
        message: 'That listing was already approved',
        data: { id, status: 'approved' as const, changed: false },
      };
    }

    await this.products.update(
      { id },
      {
        approvalStatus: 'approved',
        moderationNote: null,
        // `moderatedBy` is a uuid column, but the super admin's token carries
        // the sentinel `sub` "super-admin", which is not one. Writing it would
        // fail the query outright, so anything that is not a uuid is recorded
        // as null - the timestamp still says when it happened.
        moderatedBy: UUID.test(adminId) ? adminId : null,
        moderatedAt: new Date(),
      },
    );

    // After the write, and never in a way that can fail it: the listing is
    // approved either way, and NotificationsService swallows its own errors.
    await this.tellTheSeller(listing);

    return {
      message: 'Listing approved',
      data: { id, status: 'approved' as const, changed: true },
    };
  }

  /**
   * Tells the seller their listing is live.
   *
   * Notifications are keyed by user, but a listing only knows its shop, so
   * the owner's id comes from the seller row. `sellers.userId` is a varchar
   * while the notification column is a uuid, so anything that is not a uuid
   * is skipped rather than failing the insert.
   */
  private async tellTheSeller(listing: Product) {
    const shopId = listing.seller?.id;

    if (!shopId) {
      return;
    }

    const shop = await this.sellers.findOne({ where: { id: shopId } });

    if (!shop?.userId || !UUID.test(shop.userId)) {
      return;
    }

    await this.notifications.notify({
      userId: shop.userId,
      type: 'listing_approved',
      title: 'Your listing is live',
      body: `"${listing.name}" has been approved and buyers can now see it.`,
      referenceId: listing.id,
    });
  }

  /** Every listing, newest first, whatever its approval state. */
  async list() {
    const listings = await this.products.find({
      relations: { seller: true },
      order: { createdAt: 'DESC' },
    });

    return {
      message: 'Listings retrieved',
      data: listings.map((listing) => this.toRow(listing)),
    };
  }

  /** The shape both the table and the detail page start from. */
  private toRow(listing: Product): ListingRow {
    return {
      id: listing.id,
      product: listing.name,
      seller: listing.seller?.shopName ?? null,
      location: this.location(listing),
      date: listing.createdAt.toISOString(),
      status: listing.approvalStatus,
      image: listing.imageUrl ?? null,
    };
  }

  /** A listing sits wherever its seller does; there is no per-listing address. */
  private location(listing: Product) {
    // numeric columns come back from pg as strings
    const latitude = Number(listing.seller?.latitude);
    const longitude = Number(listing.seller?.longitude);

    if (
      listing.seller?.latitude == null ||
      listing.seller?.longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    return { latitude, longitude };
  }
}
