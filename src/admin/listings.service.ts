import { Injectable } from '@nestjs/common';
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
  /**
   * From product.imageUrl, which is not a column yet, so this is null on
   * every row. See documentation/pending-profile-fields.md.
   */
  image: string | null;
}

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

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
