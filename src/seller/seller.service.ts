import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Category } from '../categories/entities/Categories.entity';
import { coordinates as pointOf, distanceKm, roundKm } from '../common/geo';
import { shopPicture } from '../common/shop-picture';
import { shopOwners } from '../common/shop-owner';
import { placeName, placeNames } from '../common/place-name';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { MapService } from '../map/map.service';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import {
  AddProductDto,
  NearbySellersDto,
  ShopProductsDto,
  UpdateLocationDto,
  UpdatePhoneDto,
  UpdateShopNameDto,
} from './dto';

/** How many listings the dashboard shows. */
const RECENT_LISTINGS = 5;

/** Default search radius when no radius is given. */
const DEFAULT_RADIUS_KM = 25;

/** A profile picture has no excuse to be bigger. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What FileInterceptor hands over, narrowed to the parts used here. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype?: string;
  size: number;
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
 * Another shop near this one, in full.
 *
 * The same shape the buyer's map returns, so one screen can render either.
 */
export interface NearbySeller {
  id: string;
  shopName: string;
  description: string | null;
  /** The owner's profile picture, falling back to the shop's own logo. */
  logo: string | null;
  /** Where the shop is, as a place name rather than coordinates. */
  location: string | null;
  /** The same name. Kept so callers reading either field still work. */
  locationName: string | null;
  /** The raw coordinates too - a pin is dropped at a point. */
  coordinates: { latitude: number; longitude: number } | null;
  distanceKm: number;
  verificationStatus: string;
  /** When the shop was created, as an ISO timestamp. */
  joined: string;
  /** The account behind the shop. Null when the row points at no user. */
  owner: ShopOwner | null;
  /** Approved listings only, so an empty shop can be told apart. */
  productCount: number;
  /** Those listings, so the shop's page needs no second call. */
  products: ListingRow[];
}

/** One of the seller's own listings. */
export interface ListingRow {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string | null;
  category: string | null;
  tags: string[];
  status: string;
  /** Why an admin rejected or removed it, when they said. */
  moderationNote: string | null;
  listedAt: string;
}

@Injectable()
export class SellerService {
  private readonly logger = new Logger(SellerService.name);

  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Seller)
    private readonly sellers: Repository<Seller>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly uploads: UploadsService,
    private readonly map: MapService,
  ) {}

  /**
   * The seller's home screen: who they are, their counts, their newest work.
   *
   * The three counts come from one grouped query rather than three, so the
   * numbers cannot disagree with each other.
   */
  async dashboard(userId: string) {
    const shop = await this.shopOf(userId);
    const user = await this.users.findOne({ where: { id: userId } });

    const counts = await this.products
      .createQueryBuilder('product')
      .select('product.approvalStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('product.sellerId = :id', { id: shop.id })
      .groupBy('product.approvalStatus')
      .getRawMany<{ status: string; count: string }>();

    const by = (status: string) =>
      Number(counts.find((row) => row.status === status)?.count ?? 0);

    const recent = await this.products.find({
      where: { seller: { id: shop.id } },
      relations: { category: true },
      order: { createdAt: 'DESC' },
      take: RECENT_LISTINGS,
    });

    return {
      message: 'Dashboard retrieved',
      data: {
        // The shop name is the one thing always present; fullName is a real
        // column now but nothing sets it yet, so it is usually null.
        name: user?.fullName ?? shop.shopName,
        avatar: user?.avatarUrl ?? shop.logoUrl ?? null,
        shopName: shop.shopName,
        // Nothing gates on this yet - an unverified seller can still list.
        // The app uses it to nag.
        isEmailVerified: user?.emailVerified ?? false,
        totalListings: counts.reduce((sum, row) => sum + Number(row.count), 0),
        approved: by('approved'),
        pending: by('pending'),
        rejected: by('rejected'),
        recentListings: recent.map((row) => this.toRow(row)),
      },
    };
  }

  /**
   * Other shops around this one.
   *
   * The origin is the seller's own shop unless coordinates are sent, so the
   * usual call needs no parameters at all. Their own shop is left out - a
   * seller looking for neighbours does not mean themselves.
   *
   * A shop with no coordinates cannot be placed, so it never appears.
   */
  async nearbySellers(
    userId: string,
    { latitude, longitude, radiusKm }: NearbySellersDto,
  ) {
    const shop = await this.shopOf(userId);
    const origin =
      latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : pointOf(shop);

    if (!origin) {
      throw new BadRequestException(
        'Your shop has no location yet. Set one, or send latitude and longitude',
      );
    }

    const radius = radiusKm ?? DEFAULT_RADIUS_KM;

    const shops = await this.sellers
      .createQueryBuilder('seller')
      .where('seller.id != :id', { id: shop.id })
      .andWhere('seller.latitude IS NOT NULL')
      .andWhere('seller.longitude IS NOT NULL')
      .getMany();

    const nearby = shops
      .map((row) => ({ row, at: pointOf(row) }))
      .filter(
        (
          entry,
        ): entry is {
          row: Seller;
          at: { latitude: number; longitude: number };
        } => entry.at !== null,
      )
      .map(({ row, at }) => ({ row, at, distance: distanceKm(origin, at) }))
      .filter((entry) => entry.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    // Only the shops that survived the radius are worth loading in full.
    const inRadius = nearby.map((entry) => entry.row);

    const [owners, names, listings] = await Promise.all([
      shopOwners(this.users, inRadius),
      placeNames(this.map, this.sellers, inRadius),
      this.approvedListingsFor(inRadius.map((row) => row.id)),
    ]);

    const data = nearby.map(({ row, at, distance }): NearbySeller => {
      const where = names.get(row.id) ?? null;
      const owner = owners.get(row.id);
      const products = listings.get(row.id) ?? [];

      return {
        id: row.id,
        shopName: row.shopName,
        description: row.description ?? null,
        logo: shopPicture(row, owner?.avatarUrl),
        location: where,
        locationName: where,
        coordinates: at,
        distanceKm: roundKm(distance),
        verificationStatus: row.verificationStatus,
        joined: row.createdAt.toISOString(),
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
        products: products.map((listing) => this.toRow(listing)),
      };
    });

    return { message: 'Nearby shops retrieved', data };
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
      relations: { seller: true, category: true },
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

  /** Everything the seller has listed, newest first, optionally by status. */
  async shop(userId: string, { status }: ShopProductsDto) {
    const shop = await this.shopOf(userId);

    const listings = await this.products.find({
      where: {
        seller: { id: shop.id },
        ...(status ? { approvalStatus: status } : {}),
      },
      relations: { category: true },
      order: { createdAt: 'DESC' },
    });

    return {
      message: 'Products retrieved',
      data: listings.map((row) => this.toRow(row)),
    };
  }

  /** The seller's own account and shop. */
  async me(userId: string) {
    const shop = await this.shopOf(userId);
    const [user, names] = await Promise.all([
      this.users.findOne({ where: { id: userId } }),
      placeNames(this.map, this.sellers, [shop]),
    ]);

    return {
      message: 'Seller retrieved',
      data: {
        id: shop.id,
        userId,
        name: user?.fullName ?? null,
        avatar: user?.avatarUrl ?? null,
        email: user?.email ?? null,
        phone: user?.phone ?? null,
        shopName: shop.shopName,
        description: shop.description ?? null,
        logo: shopPicture(shop, user?.avatarUrl),
        location: names.get(shop.id) ?? null,
        locationName: names.get(shop.id) ?? null,
        verificationStatus: shop.verificationStatus,
        joined: shop.createdAt.toISOString(),
      },
    };
  }

  /**
   * Replaces the seller's profile picture.
   *
   * The new one goes to Cloudinary before anything is written, so a failed
   * upload leaves the old picture in place rather than clearing it.
   *
   * It is written to both `users.avatarUrl` and `sellers.logoUrl`: the buyer
   * and admin screens read the shop's logo, the seller's own screens read the
   * account's avatar, and one picture at sign-up should light up all of them.
   */
  async updateProfilePicture(userId: string, image?: UploadedImage) {
    const shop = await this.shopOf(userId);

    if (!image) {
      throw new BadRequestException('No picture was sent');
    }

    const url = await this.upload(image);

    await Promise.all([
      this.users.update({ id: userId }, { avatarUrl: url }),
      this.sellers.update({ id: shop.id }, { logoUrl: url }),
    ]);

    return {
      message: 'Profile picture updated',
      data: { avatar: url ?? null, logo: url ?? null },
    };
  }

  /**
   * Renames the shop.
   *
   * Shop names are unique across the platform, so a name another seller has
   * comes back as a 409 rather than a constraint error.
   */
  async updateShopName(userId: string, { shopName }: UpdateShopNameDto) {
    const shop = await this.shopOf(userId);

    if (shopName.toLowerCase() !== shop.shopName.toLowerCase()) {
      const taken = await this.sellers
        .createQueryBuilder('seller')
        .where('LOWER(seller.shopName) = LOWER(:shopName)', { shopName })
        .getOne();

      if (taken) {
        throw new ConflictException('That shop name is already taken');
      }
    }

    await this.sellers.update({ id: shop.id }, { shopName });

    return { message: 'Shop name updated', data: { shopName } };
  }

  /**
   * Moves the shop. Every listing shows wherever the shop is.
   *
   * The place name is resolved again, because the old one describes where the
   * shop used to be. A failed lookup clears it rather than leaving the
   * previous name against the new coordinates.
   */
  async updateLocation(
    userId: string,
    { latitude, longitude }: UpdateLocationDto,
  ) {
    const shop = await this.shopOf(userId);
    const locationName = await placeName(this.map, latitude, longitude);

    await this.sellers.update(
      { id: shop.id },
      { latitude, longitude, locationName: locationName ?? undefined },
    );

    return {
      message: 'Location updated',
      data: { location: locationName, locationName },
    };
  }

  /**
   * Changes the phone number on the account.
   *
   * The number lives on the user row, not the shop, so this is the account's
   * number rather than a shop contact line. Numbers are unique, so one
   * already registered comes back as a 409.
   */
  async updatePhone(userId: string, { phone }: UpdatePhoneDto) {
    await this.shopOf(userId);

    const taken = await this.users.findOne({ where: { phone } });

    if (taken && taken.id !== userId) {
      throw new ConflictException(
        'An account with that phone number already exists',
      );
    }

    await this.users.update({ id: userId }, { phone });

    return { message: 'Phone number updated', data: { phone } };
  }

  /**
   * Lists a new product.
   *
   * It starts as `pending`: an admin decides when shoppers see it. The
   * picture goes to Cloudinary before anything is written, so a failed
   * upload does not leave a listing with no image.
   */
  async addProduct(userId: string, dto: AddProductDto, image?: UploadedImage) {
    const shop = await this.shopOf(userId);
    const imageUrl = await this.upload(image);
    const category = await this.categoryNamed(dto.category);

    // Coordinates belong to the shop, not the listing - there is no column
    // for a per-product location. Sending them moves the whole shop, so the
    // place name has to be resolved again or it describes where the shop
    // used to be.
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      const locationName = await placeName(
        this.map,
        dto.latitude,
        dto.longitude,
      );

      await this.sellers.update(
        { id: shop.id },
        {
          latitude: dto.latitude,
          longitude: dto.longitude,
          locationName: locationName ?? undefined,
        },
      );
    }

    const { identifiers } = await this.products.insert({
      name: dto.name,
      price: dto.price,
      quantity: dto.quantity,
      tags: dto.tags ?? [],
      imageUrl,
      approvalStatus: 'pending',
      seller: { id: shop.id },
      category: { id: category.id },
    });

    const id = (identifiers[0] as { id: string }).id;

    return {
      message: 'Product added. It is pending review.',
      data: { saved: true, id, status: 'pending' },
    };
  }

  /** The shop belonging to this account, or a 403 if there is none. */
  private async shopOf(userId: string) {
    const shop = await this.sellers.findOne({ where: { userId } });

    if (!shop) {
      throw new ForbiddenException('This account does not have a shop');
    }

    return shop;
  }

  /**
   * Deletes one of the seller's own listings.
   *
   * Which shop this acts on comes from the token, and the delete is scoped to
   * it, so a seller cannot reach another shop's listing by guessing its id.
   *
   * A listing in someone else's shop gets the same 404 as one that never
   * existed: confirming it exists would leak another seller's catalogue.
   *
   * The row is really deleted, not flagged. `approvalStatus: 'removed'` is the
   * admin's soft path for taking a listing down while keeping it on file; a
   * seller deleting their own listing means it is gone. Any buyer's saved
   * copy goes with it - `saved_products` cascades on delete.
   */
  async deleteProduct(userId: string, productId: string) {
    const shop = await this.shopOf(userId);

    const listing = await this.products.findOne({
      where: { id: productId, seller: { id: shop.id } },
    });

    if (!listing) {
      throw new NotFoundException('No product found in your shop for that id');
    }

    await this.products.delete({ id: listing.id });

    this.logger.log(`Seller ${userId} deleted listing ${listing.id}`);

    return {
      message: 'Product deleted',
      data: { deleted: true, id: listing.id, name: listing.name },
    };
  }

  /** Finds the category by name, or creates it. Names are matched any case. */
  private async categoryNamed(name: string) {
    const existing = await this.categories
      .createQueryBuilder('category')
      .where('LOWER(category.name) = LOWER(:name)', { name })
      .getOne();

    if (existing) {
      return existing;
    }

    return this.categories.save(this.categories.create({ name }));
  }

  /** Sends the picture to Cloudinary and hands back its URL. */
  private async upload(image?: UploadedImage) {
    if (!image) {
      return undefined;
    }

    if (!image.mimetype?.startsWith('image/')) {
      throw new BadRequestException('The file must be an image');
    }

    if (image.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('The image must be under 5MB');
    }

    try {
      const result: unknown = await this.uploads.uploadImage(image);
      const url = (result as { secure_url?: string } | null)?.secure_url;

      if (!url) {
        throw new Error('Cloudinary returned no url');
      }

      return url;
    } catch (error) {
      // Cloudinary rejects with a plain object, not an Error, so String()
      // on it gives "[object Object]" and loses the reason entirely.
      this.logger.error(`Cloudinary upload failed: ${describe(error)}`);

      throw new BadRequestException('The image could not be uploaded');
    }
  }

  private toRow(listing: Product): ListingRow {
    return {
      id: listing.id,
      name: listing.name,
      // numeric columns come back from pg as strings
      price: Number(listing.price),
      quantity: listing.quantity,
      image: listing.imageUrl ?? null,
      category: listing.category?.name ?? null,
      tags: listing.tags ?? [],
      status: listing.approvalStatus,
      moderationNote: listing.moderationNote ?? null,
      listedAt: listing.createdAt.toISOString(),
    };
  }
}

/** Whatever was thrown, as something readable in a log line. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
