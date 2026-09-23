import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ListingApprovalStatus } from '../common/constants/domain';
import { Product } from '../products/entities/product.entity';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

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
    const listing = await this.products.findOne({ where: { id } });

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

    return {
      message: 'Listing approved',
      data: { id, status: 'approved' as const, changed: true },
    };
  }

  /** Every listing, newest first, whatever its approval state. */
  async list() {
    const listings = await this.products.find({
      relations: { seller: true },
      order: { createdAt: 'DESC' },
    });

    return {
      message: 'Listings retrieved',
      data: listings.map((listing) => ({
        id: listing.id,
        product: listing.name,
        seller: listing.seller?.shopName ?? null,
        location: this.location(listing),
        date: listing.createdAt.toISOString(),
        status: listing.approvalStatus,
        image: listing.imageUrl ?? null,
      })) satisfies ListingRow[],
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
