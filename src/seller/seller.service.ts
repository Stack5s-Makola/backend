import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../categories/entities/Categories.entity';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import { AddProductDto, ShopProductsDto } from './dto';

/** How many listings the dashboard shows. */
const RECENT_LISTINGS = 5;

/** A profile picture has no excuse to be bigger. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What FileInterceptor hands over, narrowed to the parts used here. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype?: string;
  size: number;
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
        totalListings: counts.reduce((sum, row) => sum + Number(row.count), 0),
        approved: by('approved'),
        pending: by('pending'),
        rejected: by('rejected'),
        recentListings: recent.map((row) => this.toRow(row)),
      },
    };
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
    const user = await this.users.findOne({ where: { id: userId } });

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
        logo: shop.logoUrl ?? null,
        location: coordinates(shop),
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
    // for a per-product location. Sending them moves the whole shop.
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      await this.sellers.update(
        { id: shop.id },
        { latitude: dto.latitude, longitude: dto.longitude },
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

/** A shop's coordinates, as numbers, or null when it has none. */
function coordinates(seller: {
  latitude?: number | null;
  longitude?: number | null;
}) {
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
