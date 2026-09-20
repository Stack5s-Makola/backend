import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';

/** One row of the admin sellers table. */
export interface SellerRow {
  id: string;
  /**
   * The person behind the shop, from users.fullName.
   *
   * That column does not exist yet, so this is null on every row until a
   * migration adds it; `email` is the only human identifier the schema has
   * today. See documentation/pending-profile-fields.md.
   */
  name: string | null;
  email: string | null;
  /**
   * The shop's logo, falling back to the owner's avatar.
   *
   * Both sources are pending the same migration, so this is null for now.
   */
  profilePicture: string | null;
  businessName: string;
  /** Coordinates only - there is no text address column to fall back on. */
  location: { latitude: number; longitude: number } | null;
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
  ) {}

  /** Every seller, newest first. */
  async list() {
    const sellers = await this.sellers.find({ order: { createdAt: 'DESC' } });
    const owners = await this.ownersFor(sellers);

    return {
      message: 'Sellers retrieved',
      data: sellers.map((seller) => {
        const owner = owners.get(seller.userId);

        return {
          id: seller.id,
          name: owner?.fullName ?? null,
          email: owner?.email ?? null,
          // The shop's own branding wins; the owner's face is the fallback.
          profilePicture: seller.logoUrl ?? owner?.avatarUrl ?? null,
          businessName: seller.shopName,
          location: this.location(seller),
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

    // No `select`: fullName and avatarUrl are not columns yet, and naming
    // them in one would put them in the SQL and fail the query.
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
