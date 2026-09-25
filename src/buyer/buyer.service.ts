import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { SavedProduct } from '../saved/entities/SavedProduct.entity';
import { SavedSeller } from '../saved/entities/SavedSeller.entity';
import { User } from '../users/entities/user.entity';
import { BrowseProductsDto, NearbyShopsDto, SearchProductsDto } from './dto';

/** Default search radius when the caller sends coordinates but no radius. */
const DEFAULT_RADIUS_KM = 25;

/** One card on the buyer's home page. */
export interface ProductCard {
  id: string;
  name: string;
  price: number;
  /** From product.imageUrl, which is not a column yet, so null for now. */
  image: string | null;
  category: string | null;
  /**
   * From product.tags, which is not a column yet, so always empty for now.
   * See documentation/pending-profile-fields.md.
   */
  tags: string[];
  seller: { id: string; shopName: string } | null;
  /** The seller's coordinates - a product has none of its own. */
  location: { latitude: number; longitude: number } | null;
  /** What those coordinates resolve to, for showing under the shop name. */
  locationName: string | null;
  /** Kilometres from the caller. Only present when they sent coordinates. */
  distanceKm?: number;
  listedAt: string;
}

/** One shop the buyer keeps on their phone. */
export interface ShopCard {
  id: string;
  shopName: string;
  /** From seller.logoUrl, which is not a column yet, so null for now. */
  logo: string | null;
  location: { latitude: number; longitude: number } | null;
  locationName: string | null;
  verificationStatus: string;
}

/** A shop near the buyer, with how far away it is. */
export interface NearbyShop extends ShopCard {
  distanceKm: number;
  /** How many approved listings it has, so an empty shop can be hidden. */
  productCount: number;
}

/** Everything the product page shows. */
export interface ProductDetail extends ProductCard {
  subcategory: string | null;
  /** pending | approved | rejected | removed - so the app can say "no longer on sale". */
  status: string;
  shop: (ShopCard & { id: string }) | null;
}

@Injectable()
export class BuyerService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(SavedProduct)
    private readonly savedProducts: Repository<SavedProduct>,
    @InjectRepository(SavedSeller)
    private readonly savedShops: Repository<SavedSeller>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Seller)
    private readonly sellers: Repository<Seller>,
  ) {}

  /**
   * Shops around the buyer, nearest first.
   *
   * A shop with no coordinates cannot be placed, so it is left out entirely -
   * unlike product browsing, where a shop without them still appears when no
   * location is given. Here there is no sensible way to include it.
   *
   * `productCount` counts approved listings only, so the app can hide a shop
   * a shopper cannot buy anything from.
   */
  async nearbyShops({ latitude, longitude, radiusKm }: NearbyShopsDto) {
    const radius = radiusKm ?? DEFAULT_RADIUS_KM;

    const shops = await this.sellers
      .createQueryBuilder('seller')
      .where('seller.latitude IS NOT NULL')
      .andWhere('seller.longitude IS NOT NULL')
      .getMany();

    const counts = await this.approvedCounts(shops.map((shop) => shop.id));

    const nearby = shops
      .map((shop) => ({ shop, at: coordinates(shop) }))
      .filter(
        (
          row,
        ): row is {
          shop: Seller;
          at: { latitude: number; longitude: number };
        } => row.at !== null,
      )
      .map(({ shop, at }) => ({
        shop,
        at,
        distance: distanceKm(latitude, longitude, at),
      }))
      .filter((row) => row.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .map(({ shop, at, distance }): NearbyShop => ({
        id: shop.id,
        shopName: shop.shopName,
        logo: shop.logoUrl ?? null,
        location: at,
        locationName: shop.locationName ?? null,
        verificationStatus: shop.verificationStatus,
        distanceKm: Math.round(distance * 10) / 10,
        productCount: counts.get(shop.id) ?? 0,
      }));

    return { message: 'Shops retrieved', data: nearby };
  }

  /** How many approved listings each of these shops has. */
  private async approvedCounts(shopIds: string[]) {
    if (!shopIds.length) {
      return new Map<string, number>();
    }

    const rows = await this.products
      .createQueryBuilder('product')
      .select('product.sellerId', 'sellerId')
      .addSelect('COUNT(*)', 'count')
      .where('product.approvalStatus = :status', { status: 'approved' })
      .andWhere('product.sellerId IN (:...shopIds)', { shopIds })
      .groupBy('product.sellerId')
      .getRawMany<{ sellerId: string; count: string }>();

    return new Map(rows.map((row) => [row.sellerId, Number(row.count)]));
  }

  /**
   * One listing in full, for the product page.
   *
   * Any approval state is returned, with `status` alongside, rather than
   * hiding an unapproved one behind a 404: a buyer can reach this from a
   * saved item, and "no longer on sale" is a better screen than "not found".
   */
  async product(id: string): Promise<{ message: string; data: ProductDetail }> {
    const listing = await this.products.findOne({
      where: { id },
      relations: { seller: true, category: true, subcategory: true },
    });

    if (!listing) {
      throw new NotFoundException('No product found for that id');
    }

    return {
      message: 'Product retrieved',
      data: {
        ...this.toCard(listing),
        subcategory: listing.subcategory?.name ?? null,
        status: listing.approvalStatus,
        shop: listing.seller
          ? {
              id: listing.seller.id,
              shopName: listing.seller.shopName,
              logo: listing.seller.logoUrl ?? null,
              location: coordinates(listing.seller),
              locationName: listing.seller.locationName ?? null,
              verificationStatus: listing.seller.verificationStatus,
            }
          : null,
      },
    };
  }

  /**
   * The header on the profile screen: who this is, and their picture.
   *
   * Both come from columns that do not exist yet, so both are null. The email
   * rides along because it is the only thing that can identify the account on
   * screen today. See documentation/pending-profile-fields.md.
   */
  async profile(userId: string) {
    const user = await this.account(userId);

    return {
      message: 'Profile retrieved',
      data: {
        name: user.fullName ?? null,
        profilePicture: user.avatarUrl ?? null,
        email: user.email,
      },
    };
  }

  /** The full account, for the "personal details" screen. */
  async personalDetails(userId: string) {
    const user = await this.account(userId);

    return {
      message: 'Personal details retrieved',
      data: {
        id: user.id,
        name: user.fullName ?? null,
        profilePicture: user.avatarUrl ?? null,
        email: user.email,
        phone: user.phone ?? null,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        joined: user.createdAt.toISOString(),
      },
    };
  }

  /**
   * Loads the signed-in account.
   *
   * No `select`: fullName and avatarUrl are not columns, and naming them in
   * one would put them in the SQL and fail the query. The password hash is
   * loaded as a result, so nothing here may return the row as it is.
   */
  private async account(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('No account found for that id');
    }

    return user;
  }

  /**
   * The products this buyer saved, in full, for the phone to keep offline.
   *
   * Approval state is deliberately not filtered here. A listing the buyer
   * already saved should not silently vanish from their phone because an
   * admin is still looking at it; the card carries enough to decide.
   */
  async savedProductsFor(userId: string) {
    const saved = await this.savedProducts.find({
      where: { user: { id: userId } },
      relations: { product: { seller: true, category: true } },
    });

    return {
      message: 'Saved products retrieved',
      data: saved
        // A row whose product was deleted leaves a dangling save.
        .filter((row) => row.product)
        .map((row) => this.toCard(row.product)),
    };
  }

  /** The shops this buyer saved, for the phone to keep offline. */
  async savedShopsFor(userId: string) {
    const saved = await this.savedShops.find({
      where: { user: { id: userId } },
      relations: { seller: true },
    });

    return {
      message: 'Saved shops retrieved',
      data: saved
        .filter((row) => row.seller)
        .map((row): ShopCard => ({
          id: row.seller.id,
          shopName: row.seller.shopName,
          logo: row.seller.logoUrl ?? null,
          location: coordinates(row.seller),
          locationName: row.seller.locationName ?? null,
          verificationStatus: row.seller.verificationStatus,
        })),
    };
  }

  /**
   * What a buyer sees on the home page.
   *
   * Only approved listings: pending, rejected and removed ones are the
   * admin's business, not a shopper's.
   *
   * Distance is worked out from the seller's coordinates, since a listing has
   * no location of its own. Sellers with no coordinates cannot be placed, so
   * they drop out of a radius search - they still appear when no coordinates
   * are sent.
   */
  async browse(query: BrowseProductsDto) {
    const listings = await this.onSale(query).getMany();

    return {
      message: 'Products retrieved',
      data: this.near(
        listings.map((row) => this.toCard(row)),
        query,
      ),
    };
  }

  /**
   * Free text search across a listing's name and its category.
   *
   * Case insensitive and matches anywhere in the field, so "ken" finds
   * "Kente cloth".
   *
   * Tags are NOT searched. `product` has no tags column, so there is nothing
   * to match against - adding the clause now would be a filter that can never
   * fire. See documentation/pending-profile-fields.md for the one statement
   * that changes that, and the line to add here when it does.
   */
  async search({ q, ...rest }: SearchProductsDto) {
    const listings = await this.onSale(rest)
      .andWhere('(product.name ILIKE :term OR category.name ILIKE :term)', {
        term: `%${q}%`,
      })
      .getMany();

    return {
      message: 'Products retrieved',
      data: this.near(
        listings.map((row) => this.toCard(row)),
        rest,
      ),
    };
  }

  /** Approved listings, newest first, optionally narrowed to one category. */
  private onSale({ category }: BrowseProductsDto): SelectQueryBuilder<Product> {
    const builder = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.seller', 'seller')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.approvalStatus = :status', { status: 'approved' })
      .orderBy('product.createdAt', 'DESC');

    if (category) {
      // Whole name, any casing: a shopper taps a category, they do not type it.
      builder.andWhere('LOWER(category.name) = LOWER(:category)', { category });
    }

    return builder;
  }

  /** Filters and sorts by distance, but only when coordinates were sent. */
  private near(
    cards: ProductCard[],
    { latitude, longitude, radiusKm }: BrowseProductsDto,
  ) {
    if (latitude === undefined || longitude === undefined) {
      return cards;
    }

    const radius = radiusKm ?? DEFAULT_RADIUS_KM;

    return cards
      .map((card) => ({
        card,
        distance: card.location
          ? distanceKm(latitude, longitude, card.location)
          : null,
      }))
      .filter(
        (row): row is { card: ProductCard; distance: number } =>
          row.distance !== null && row.distance <= radius,
      )
      .sort((a, b) => a.distance - b.distance)
      .map(({ card, distance }) => ({
        ...card,
        distanceKm: Math.round(distance * 10) / 10,
      }));
  }

  private toCard(listing: Product): ProductCard {
    return {
      id: listing.id,
      name: listing.name,
      // numeric columns come back from pg as strings
      price: Number(listing.price),
      image: listing.imageUrl ?? null,
      category: listing.category?.name ?? null,
      tags: listing.tags ?? [],
      seller: listing.seller
        ? { id: listing.seller.id, shopName: listing.seller.shopName }
        : null,
      location: this.location(listing),
      locationName: listing.seller?.locationName ?? null,
      listedAt: listing.createdAt.toISOString(),
    };
  }

  private location(listing: Product) {
    return listing.seller ? coordinates(listing.seller) : null;
  }
}

/** A shop's coordinates, as numbers, or null when it has none. */
function coordinates(seller: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  // numeric columns come back from pg as strings
  const latitude = Number(seller.latitude);
  const longitude = Number(seller.longitude);

  if (
    seller.latitude == null ||
    seller.longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return { latitude, longitude };
}

/** Great-circle distance in kilometres, the same formula SellersService uses. */
function distanceKm(
  lat: number,
  lng: number,
  to: { latitude: number; longitude: number },
) {
  const EARTH_RADIUS_KM = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.latitude - lat);
  const dLng = toRadians(to.longitude - lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
