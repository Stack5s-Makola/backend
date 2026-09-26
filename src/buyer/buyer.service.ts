import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Not, Repository, SelectQueryBuilder } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { MapService } from '../map/map.service';
import { shopPicture, shopPictures } from '../common/shop-picture';
import { shopOwners } from '../common/shop-owner';
import { placeName, placeNames } from '../common/place-name';
import { UploadsService } from '../uploads/uploads.service';
import { Seller } from '../sellers/entities/seller.entity';
import { SavedProduct } from '../saved/entities/SavedProduct.entity';
import { SavedSeller } from '../saved/entities/SavedSeller.entity';
import { User } from '../users/entities/user.entity';
import { BrowseProductsDto, NearbyShopsDto, SearchProductsDto } from './dto';

/** Default search radius when the caller sends coordinates but no radius. */
const DEFAULT_RADIUS_KM = 25;

/** Matches the register and auth modules, so hashes stay comparable. */
const SALT_ROUNDS = 10;

/** A profile picture has no excuse to be bigger. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What FileInterceptor hands over, narrowed to the parts used here. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype?: string;
  size: number;
}

/** The person behind a listing. */
export interface ProductOwner {
  id: string;
  name: string | null;
  profilePicture: string | null;
  email: string;
  phone: string | null;
  isEmailVerified: boolean;
}

/** The shop a listing belongs to, and who runs it. */
export interface ProductShop {
  id: string;
  shopName: string;
  /** The owner's profile picture, falling back to the shop's own logo. */
  logo: string | null;
  /** What the shop says about itself. */
  description: string | null;
  verificationStatus: string;
  /** Where the shop is, as a place name. */
  location: string | null;
  locationName: string | null;
  /** The account behind it. Null when the row points at no user. */
  owner: ProductOwner | null;
}

/**
 * One card on the buyer's home page - the whole listing.
 *
 * Everything the product has, plus the shop and the person behind it, so a
 * card can be rendered or a product page opened without a second call.
 */
export interface ProductCard {
  id: string;
  name: string;
  /** What the seller wrote about it. Null until a seller sets one. */
  description: string | null;
  price: number;
  /** How many are in stock. Zero means out of stock, not unlisted. */
  quantity: number;
  image: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  /** pending | approved | rejected | removed. Always approved when browsing. */
  status: string;
  /** The shop, its picture, and its owner. */
  seller: ProductShop | null;
  /**
   * Where the shop is, as a place name - a product has no location of its
   * own. Resolved from the shop's coordinates; null when it has none.
   */
  location: string | null;
  /** The same name. Kept so callers reading either field still work. */
  locationName: string | null;
  /** Kilometres from the caller. Only present when they sent coordinates. */
  distanceKm?: number;
  listedAt: string;
  /** When it was last edited - a price change, a restock. */
  updatedAt: string;
}

/**
 * What a batch of cards needs looking up before it can be built.
 *
 * Both maps are keyed by shop id and fetched once for the whole page, so a
 * page of twenty listings from three shops costs one owner query and three
 * place-name lookups rather than twenty of each.
 */
interface CardContext {
  names: Map<string, string | null>;
  owners: Map<string, User>;
}

/** One shop the buyer keeps on their phone. */
export interface ShopCard {
  id: string;
  shopName: string;
  /** The owner's profile picture, falling back to the shop's own logo. */
  logo: string | null;
  /** Where the shop is, as a place name rather than coordinates. */
  location: string | null;
  /** The same name. Kept so callers reading either field still work. */
  locationName: string | null;
  verificationStatus: string;
}

/** The person behind a shop, as the map page shows them. */
export interface ShopOwner {
  id: string | null;
  name: string | null;
  profilePicture: string | null;
  email: string | null;
  phone: string | null;
  isEmailVerified: boolean;
}

/**
 * A shop inside the map's radius, in full.
 *
 * Everything the map page needs about one shop, so tapping a pin opens the
 * shop without another call: who owns it, how to reach them, how far away it
 * is, and what it is selling.
 */
export interface NearbyShop {
  id: string;
  shopName: string;
  description: string | null;
  /** The owner's profile picture, falling back to the shop's own logo. */
  logo: string | null;
  /** Where the shop is, as a place name rather than coordinates. */
  location: string | null;
  /** The same name. Kept so callers reading either field still work. */
  locationName: string | null;
  /**
   * The raw coordinates too - this is the one endpoint that needs them, since
   * a pin is dropped at a point and a place name cannot be plotted.
   */
  coordinates: { latitude: number; longitude: number } | null;
  distanceKm: number;
  verificationStatus: string;
  /** When the shop was created, as an ISO timestamp. */
  joined: string;
  /** The account behind the shop. Null when the row points at no user. */
  owner: ShopOwner | null;
  /** How many approved listings it has, so an empty shop can be hidden. */
  productCount: number;
  /** Those listings, so the shop's page needs no second call. */
  products: ProductCard[];
}

/** Everything the product page shows. */
/**
 * The product page.
 *
 * A card already carries everything, so this only renames `seller` to `shop`
 * alongside it - the product page was written against that name.
 */
export interface ProductDetail extends ProductCard {
  shop: ProductShop | null;
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
    private readonly map: MapService,
    private readonly uploads: UploadsService,
  ) {}

  private readonly logger = new Logger(BuyerService.name);

  /**
   * Shops around the buyer, nearest first, each in full.
   *
   * This is the map page, so every shop inside the radius comes back whole -
   * the shop, the person behind it, and its approved listings - and tapping a
   * pin needs no second call.
   *
   * A shop with no coordinates cannot be placed, so it is left out entirely -
   * unlike product browsing, where a shop without them still appears when no
   * location is given. Here there is no sensible way to include it.
   *
   * The radius filter runs before anything else is fetched: owners, place
   * names and listings are only loaded for the shops that survive it, so a
   * small radius stays cheap however many shops exist.
   */
  async nearbyShops({ latitude, longitude, radiusKm }: NearbyShopsDto) {
    const radius = radiusKm ?? DEFAULT_RADIUS_KM;

    const shops = await this.sellers
      .createQueryBuilder('seller')
      .where('seller.latitude IS NOT NULL')
      .andWhere('seller.longitude IS NOT NULL')
      .getMany();

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
      .sort((a, b) => a.distance - b.distance);

    const inRadius = nearby.map((row) => row.shop);

    const [owners, names, listings] = await Promise.all([
      shopOwners(this.users, inRadius),
      placeNames(this.map, this.sellers, inRadius),
      this.approvedListingsFor(inRadius.map((shop) => shop.id)),
    ]);

    const data = nearby.map(({ shop, at, distance }): NearbyShop => {
      const where = names.get(shop.id) ?? null;
      const owner = owners.get(shop.id);
      const products = listings.get(shop.id) ?? [];

      return {
        id: shop.id,
        shopName: shop.shopName,
        description: shop.description ?? null,
        logo: shopPicture(shop, owner?.avatarUrl),
        location: where,
        locationName: where,
        coordinates: at,
        distanceKm: Math.round(distance * 10) / 10,
        verificationStatus: shop.verificationStatus,
        joined: shop.createdAt.toISOString(),
        owner: owner
          ? {
              id: owner.id,
              name: owner.fullName ?? null,
              profilePicture: owner.avatarUrl ?? null,
              email: owner.email,
              phone: owner.phone ?? null,
              isEmailVerified: owner.emailVerified ?? false,
            }
          : null,
        productCount: products.length,
        products: products.map((listing) =>
          this.toCard(listing, { names, owners }),
        ),
      };
    });

    return { message: 'Shops retrieved', data };
  }

  /**
   * The approved listings of each of these shops, keyed by shop id.
   *
   * One query for the whole page rather than one per shop, grouped in memory.
   * `productCount` is this list's length, so the number and the listings can
   * never disagree.
   */
  private async approvedListingsFor(shopIds: string[]) {
    const byShop = new Map<string, Product[]>();

    if (!shopIds.length) {
      return byShop;
    }

    const listings = await this.products.find({
      where: { seller: { id: In(shopIds) }, approvalStatus: 'approved' },
      relations: { seller: true, category: true, subcategory: true },
      order: { createdAt: 'DESC' },
    });

    for (const listing of listings) {
      if (!listing.seller) {
        continue;
      }

      byShop.set(listing.seller.id, [
        ...(byShop.get(listing.seller.id) ?? []),
        listing,
      ]);
    }

    return byShop;
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

    const context = await this.cardContext([listing]);
    const card = this.toCard(listing, context);

    return {
      message: 'Product retrieved',
      data: {
        ...card,
        subcategory: card.subcategory,
        status: card.status,
        // The same shop the card already carries, under the name the product
        // page uses. Kept so a screen reading either one works.
        shop: card.seller,
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
    const where = await this.whereTheyAre(user);

    return {
      message: 'Profile retrieved',
      data: {
        name: user.fullName ?? null,
        profilePicture: user.avatarUrl ?? null,
        email: user.email,
        // The readable place, never the coordinates - this is a profile
        // screen. Both fields carry the same name.
        location: where,
        locationName: where,
      },
    };
  }

  /**
   * Where a buyer is, as a place name.
   *
   * Accounts created before the column, or before Mapbox was wired up, have
   * coordinates but no name; those are resolved here once and stored.
   */
  private async whereTheyAre(user: User) {
    const names = await placeNames(this.map, this.users, [user]);

    return names.get(user.id) ?? null;
  }

  /** The full account, for the "personal details" screen. */
  async personalDetails(userId: string) {
    const user = await this.account(userId);
    const where = await this.whereTheyAre(user);

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
        location: where,
        locationName: where,
        joined: user.createdAt.toISOString(),
      },
    };
  }

  /**
   * Replaces the buyer's profile picture.
   *
   * The new one goes to Cloudinary before anything is written, so a failed
   * upload leaves the old picture in place rather than clearing it.
   */
  async updateProfilePicture(userId: string, image?: UploadedImage) {
    await this.account(userId);

    if (!image) {
      throw new BadRequestException('No picture was sent');
    }

    if (!image.mimetype?.startsWith('image/')) {
      throw new BadRequestException('The file must be an image');
    }

    if (image.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('The image must be under 5MB');
    }

    let url: string;

    try {
      const result: unknown = await this.uploads.uploadImage(image);
      const secureUrl = (result as { secure_url?: string } | null)?.secure_url;

      if (!secureUrl) {
        throw new Error('Cloudinary returned no url');
      }

      url = secureUrl;
    } catch (error) {
      // Cloudinary rejects with a plain object, not an Error, so String() on
      // it gives "[object Object]" and loses the reason entirely.
      this.logger.error(`Cloudinary upload failed: ${describeError(error)}`);

      throw new BadRequestException('The image could not be uploaded');
    }

    await this.users.update({ id: userId }, { avatarUrl: url });

    return {
      message: 'Profile picture updated',
      data: { profilePicture: url },
    };
  }

  /** Changes the name shown on the profile. */
  async updateName(userId: string, name: string) {
    await this.account(userId);
    await this.users.update({ id: userId }, { fullName: name });

    return { message: 'Name updated', data: { name } };
  }

  /**
   * Changes the phone number on the account.
   *
   * Numbers are unique, so one already registered comes back as a 409. The
   * caller's own number is allowed through - re-saving it is not a clash.
   */
  async updatePhone(userId: string, phone: string) {
    await this.account(userId);

    const taken = await this.users.findOne({
      where: { phone, id: Not(userId) },
    });

    if (taken) {
      throw new ConflictException(
        'An account with that phone number already exists',
      );
    }

    await this.users.update({ id: userId }, { phone });

    return { message: 'Phone number updated', data: { phone } };
  }

  /**
   * Changes the password.
   *
   * The current one has to be right. A token alone is not enough: tokens here
   * never expire and nothing revokes them, so a stolen one would otherwise
   * mean a permanent takeover rather than a temporary session.
   *
   * Note this does NOT sign other sessions out - nothing can, while tokens
   * carry no expiry and there is no revocation list.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.account(userId);

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Your current password is incorrect');
    }

    await this.users.update(
      { id: userId },
      { passwordHash: await bcrypt.hash(newPassword, SALT_ROUNDS) },
    );

    return { message: 'Password changed', data: { changed: true } };
  }

  /**
   * Sets where the buyer is, and resolves it to a readable place.
   *
   * Sellers move their shop at /api/seller/me/update/location; this is the
   * buyer equivalent, and the only way an account registered before the
   * columns existed can get a location at all.
   */
  async updateLocation(userId: string, latitude: number, longitude: number) {
    await this.account(userId);

    const locationName = await placeName(this.map, latitude, longitude);

    await this.users.update(
      { id: userId },
      { latitude, longitude, locationName: locationName ?? undefined },
    );

    return {
      message: 'Location updated',
      data: { locationName },
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
      relations: {
        product: { seller: true, category: true, subcategory: true },
      },
    });

    const listings = saved.map((row) => row.product).filter(Boolean);
    const context = await this.cardContext(listings);

    return {
      message: 'Saved products retrieved',
      data: saved
        // A row whose product was deleted leaves a dangling save.
        .filter((row) => row.product)
        .map((row) => this.toCard(row.product, context)),
    };
  }

  /** The shops this buyer saved, for the phone to keep offline. */
  async savedShopsFor(userId: string) {
    const saved = await this.savedShops.find({
      where: { user: { id: userId } },
      relations: { seller: true },
    });

    const shops = saved.map((row) => row.seller).filter(Boolean);
    const [pictures, names] = await Promise.all([
      shopPictures(this.users, shops),
      placeNames(this.map, this.sellers, shops),
    ]);

    return {
      message: 'Saved shops retrieved',
      data: saved
        .filter((row) => row.seller)
        .map((row): ShopCard => ({
          id: row.seller.id,
          shopName: row.seller.shopName,
          logo: pictures.get(row.seller.id) ?? null,
          location: names.get(row.seller.id) ?? null,
          locationName: names.get(row.seller.id) ?? null,
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
    const context = await this.cardContext(listings);

    return {
      message: 'Products retrieved',
      data: this.near(listings, context, query),
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

    const context = await this.cardContext(listings);

    return {
      message: 'Products retrieved',
      data: this.near(listings, context, rest),
    };
  }

  /** Approved listings, newest first, optionally narrowed to one category. */
  private onSale({ category }: BrowseProductsDto): SelectQueryBuilder<Product> {
    const builder = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.seller', 'seller')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.subcategory', 'subcategory')
      .where('product.approvalStatus = :status', { status: 'approved' })
      .orderBy('product.createdAt', 'DESC');

    if (category) {
      // Whole name, any casing: a shopper taps a category, they do not type it.
      builder.andWhere('LOWER(category.name) = LOWER(:category)', { category });
    }

    return builder;
  }

  /**
   * Turns listings into cards, filtered and sorted by distance when the
   * shopper sent coordinates.
   *
   * Distance is measured off the listing, not the card: a card carries the
   * place name now, and a name cannot be measured from.
   */
  private near(
    listings: Product[],
    context: CardContext,
    { latitude, longitude, radiusKm }: BrowseProductsDto,
  ) {
    if (latitude === undefined || longitude === undefined) {
      return listings.map((listing) => this.toCard(listing, context));
    }

    const radius = radiusKm ?? DEFAULT_RADIUS_KM;

    return listings
      .map((listing) => {
        const at = this.location(listing);

        return {
          listing,
          distance: at ? distanceKm(latitude, longitude, at) : null,
        };
      })
      .filter(
        (row): row is { listing: Product; distance: number } =>
          row.distance !== null && row.distance <= radius,
      )
      .sort((a, b) => a.distance - b.distance)
      .map(({ listing, distance }) => ({
        ...this.toCard(listing, context),
        distanceKm: Math.round(distance * 10) / 10,
      }));
  }

  private toCard(
    listing: Product,
    { names, owners }: CardContext,
  ): ProductCard {
    const shop = listing.seller;
    const where = shop ? (names.get(shop.id) ?? null) : null;
    const owner = shop ? owners.get(shop.id) : undefined;

    return {
      id: listing.id,
      name: listing.name,
      description: listing.description ?? null,
      // numeric columns come back from pg as strings
      price: Number(listing.price),
      quantity: listing.quantity,
      image: listing.imageUrl ?? null,
      category: listing.category?.name ?? null,
      subcategory: listing.subcategory?.name ?? null,
      tags: listing.tags ?? [],
      status: listing.approvalStatus,
      seller: shop
        ? {
            id: shop.id,
            shopName: shop.shopName,
            logo: shopPicture(shop, owner?.avatarUrl),
            description: shop.description ?? null,
            verificationStatus: shop.verificationStatus,
            location: where,
            locationName: where,
            owner: owner
              ? {
                  id: owner.id,
                  name: owner.fullName ?? null,
                  profilePicture: owner.avatarUrl ?? null,
                  email: owner.email,
                  phone: owner.phone ?? null,
                  isEmailVerified: owner.emailVerified ?? false,
                }
              : null,
          }
        : null,
      location: where,
      locationName: where,
      listedAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    };
  }

  /**
   * The place names and owners behind a batch of listings.
   *
   * Looked up once for the whole page, then handed to every toCard call.
   */
  private async cardContext(listings: Product[]): Promise<CardContext> {
    const shops = listings.map((listing) => listing.seller).filter(Boolean);

    const [names, owners] = await Promise.all([
      placeNames(this.map, this.sellers, shops),
      shopOwners(this.users, shops),
    ]);

    return { names, owners };
  }

  /** The shop's coordinates - kept internally, for distance only. */
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

/** Whatever was thrown, as something readable in a log line. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
