import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MapService } from '../map/map.service';
import { placeNames } from '../common/place-name';
import { shopPicture } from '../common/shop-picture';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';

/** One row of the admin sellers table. */
export interface SellerRow {
  id: string;
  /** The person behind the shop, from users.fullName. */
  name: string | null;
  email: string | null;
  /** The owner's profile picture, falling back to the shop's own logo. */
  profilePicture: string | null;
  businessName: string;
  /** Where the shop is, as a place name - what the table column shows. */
  location: string | null;
  /** The same name, under the older field name. */
  locationName: string | null;
  /**
   * The raw coordinates as well, because the dashboard plots sellers on a
   * map and a name cannot be plotted. Null when the shop has none.
   */
  coordinates: { latitude: number; longitude: number } | null;
  /**
   * Whether the owner confirmed their email address.
   *
   * This is the verification the dashboard goes by. `status` below is the
   * separate shop verification, which nothing sets yet.
   */
  isEmailVerified: boolean;
  status: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class SellersService {
  constructor(
    @InjectRepository(Seller)
    private readonly sellers: Repository<Seller>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly map: MapService,
  ) {}

  /** Every seller, newest first. */
  async list() {
    const sellers = await this.sellers.find({ order: { createdAt: 'DESC' } });
    const [owners, names] = await Promise.all([
      this.ownersFor(sellers),
      placeNames(this.map, this.sellers, sellers),
    ]);

    return {
      message: 'Sellers retrieved',
      data: sellers.map((seller) => {
        const owner = owners.get(seller.userId);

        return {
          id: seller.id,
          name: owner?.fullName ?? null,
          email: owner?.email ?? null,
          profilePicture: shopPicture(seller, owner?.avatarUrl),
          businessName: seller.shopName,
          location: names.get(seller.id) ?? null,
          locationName: names.get(seller.id) ?? null,
          coordinates: this.location(seller),
          isEmailVerified: owner?.emailVerified ?? false,
          status: seller.verificationStatus,
        };
      }) satisfies SellerRow[],
    };
  }

  /**
   * Looks the owners up in one query rather than joining.
   *
   * sellers.userId is a varchar while users.id is a uuid, so a join needs a
   * cast, and a row holding anything that is not a uuid makes the whole query
   * fail. Matching in memory keeps one bad row from emptying the table.
   */
  private async ownersFor(sellers: Seller[]) {
    const ids = [...new Set(sellers.map((s) => s.userId))].filter((id) =>
      UUID.test(id ?? ''),
    );

    if (!ids.length) {
      return new Map<string, User>();
    }

    const owners = await this.users.find({ where: { id: In(ids) } });

    return new Map(owners.map((owner) => [owner.id, owner]));
  }

  private location(seller: Seller) {
    // numeric columns come back from pg as strings
    const latitude = Number(seller.latitude);
    const longitude = Number(seller.longitude);

    if (
      seller.latitude === null ||
      seller.longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    return { latitude, longitude };
  }
}
