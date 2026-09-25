import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DataSource, QueryFailedError } from 'typeorm';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { MapService } from '../map/map.service';
import { OtpService } from '../otp/otp.service';
import { UploadsService } from '../uploads/uploads.service';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { RegisterBuyerDto, SetSellerProfileDto } from './dto';

/** Postgres: unique_violation. */
const UNIQUE_VIOLATION = '23505';

/** Matches the auth module, so hashes stay comparable across both. */
const SALT_ROUNDS = 10;

/** Cloudinary's free tier takes more, but a profile picture has no excuse. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What FileInterceptor hands over, narrowed to the parts used here. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype?: string;
  size: number;
}

/**
 * The shop's coordinates, from whichever form the client sent.
 *
 * JSON clients nest them under `location`; a multipart request cannot nest,
 * so those send flat fields instead.
 */
function coordinatesFrom(dto: SetSellerProfileDto) {
  const latitude = dto.location?.latitude ?? dto.latitude;
  const longitude = dto.location?.longitude ?? dto.longitude;

  if (latitude === undefined || longitude === undefined) {
    throw new BadRequestException(
      'location is required: send location.latitude and location.longitude, or latitude and longitude',
    );
  }

  return { latitude, longitude };
}

@Injectable()
export class RegisterService {
  private readonly logger = new Logger(RegisterService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly uploads: UploadsService,
    private readonly map: MapService,
  ) {}

  /**
   * Turns coordinates into a place name, or null.
   *
   * Never throws. A shop with coordinates but no readable name is fine - the
   * name is for display, the coordinates are what search works from - so
   * Mapbox being down must not stop someone registering.
   */
  private async placeName(latitude: number, longitude: number) {
    try {
      return await this.map.reverseGeocode(latitude, longitude);
    } catch (error) {
      this.logger.error(
        `Could not resolve ${latitude},${longitude} to a place name: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }

  /**
   * Creates a seller in one step: the account, its hashed password and the
   * shop row, then emails a verification code.
   *
   * The writes happen in one transaction, so a failure part way through
   * cannot leave an account with no shop, or a shop with no account. The code
   * is sent after it commits - see the note on that call below.
   */
  async setSellerProfile(dto: SetSellerProfileDto, image?: UploadedImage) {
    const { email, phone, password, name, shopName, role } = dto;
    const location = coordinatesFrom(dto);

    // Checked up front so the client gets a clear message rather than a
    // constraint error. The unique indexes below are still what guarantees it:
    // two requests racing here would both pass this check.
    await this.assertAvailable(dto);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Both network calls happen before the transaction: holding one open
    // across a third party request is asking for trouble. A failed upload
    // fails the request, before any account exists; a failed lookup does not.
    const avatarUrl = await this.upload(image);
    const locationName = await this.placeName(
      location.latitude,
      location.longitude,
    );

    let userId: string;

    try {
      userId = await this.db.transaction(async (manager) => {
        const { identifiers } = await manager.insert(User, {
          email,
          phone,
          passwordHash,
          role,
          avatarUrl,
          fullName: name,
        });

        const id = (identifiers[0] as { id: string }).id;

        await manager.insert(Seller, {
          userId: id,
          shopName,
          latitude: location.latitude,
          longitude: location.longitude,
          // `undefined` leaves the column alone; the entity's field is
          // optional rather than nullable, so null is not assignable.
          locationName: locationName ?? undefined,
        });

        return id;
      });
    } catch (error) {
      throw this.explain(error);
    }

    await this.issueCode(email);

    // Signed here so the app is logged in straight after sign-up, rather than
    // having to post the password again. Note the account is not verified
    // yet: the token says who they are, not that their email is confirmed.
    //
    // No expiry - see SessionTokenModule for why, and what it costs.
    const payload: JwtPayload = { sub: userId, email, role };

    return {
      message:
        'Seller profile created. Check your email for a verification code.',
      data: {
        saved: true,
        accessToken: await this.jwt.signAsync(payload),
        user: { id: userId, email, role, emailVerified: false },
      },
    };
  }

  /**
   * Creates a plain account - no shop - then emails a verification code.
   *
   * One row, so no transaction is needed: the insert either happens or it
   * does not.
   */
  async registerBuyer(
    {
      email,
      phone,
      password,
      role,
      name,
      latitude,
      longitude,
    }: RegisterBuyerDto,
    image?: UploadedImage,
  ) {
    await this.assertAccountAvailable({ email, phone });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const avatarUrl = await this.upload(image);

    // Only when both arrived: one coordinate alone is not a position.
    const locationName =
      latitude !== undefined && longitude !== undefined
        ? await this.placeName(latitude, longitude)
        : null;

    let userId: string;

    try {
      const { identifiers } = await this.db.getRepository(User).insert({
        email,
        phone,
        passwordHash,
        role,
        avatarUrl,
        fullName: name,
        latitude,
        longitude,
        locationName: locationName ?? undefined,
      });

      userId = (identifiers[0] as { id: string }).id;
    } catch (error) {
      throw this.explain(error);
    }

    await this.issueCode(email);

    return {
      message: 'Account created. Check your email for a verification code.',
      data: {
        saved: true,
        accessToken: await this.jwt.signAsync({
          sub: userId,
          email,
          role,
        } satisfies JwtPayload),
        user: { id: userId, email, role, emailVerified: false },
      },
    };
  }

  /**
   * Sends the picture to Cloudinary and hands back its URL.
   *
   * Nothing to upload is not an error - the picture is optional. A rejected
   * file or a failed upload is, and it fails the request before any account
   * is written, so nobody ends up registered with a picture that never
   * arrived.
   */
  private async upload(image?: UploadedImage) {
    if (!image) {
      return undefined;
    }

    if (!image.mimetype?.startsWith('image/')) {
      throw new BadRequestException('The profile picture must be an image');
    }

    if (image.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('The profile picture must be under 5MB');
    }

    try {
      const result: unknown = await this.uploads.uploadImage(image);
      const url = (result as { secure_url?: string } | null)?.secure_url;

      if (!url) {
        throw new Error('Cloudinary returned no url');
      }

      return url;
    } catch (error) {
      // Cloudinary rejects with a plain object, not an Error, so String() on
      // it gives "[object Object]" and loses the reason entirely.
      this.logger.error(`Cloudinary upload failed: ${describe(error)}`);

      throw new BadRequestException(
        'The profile picture could not be uploaded',
      );
    }
  }

  /**
   * Issues a verification code, and swallows a failure to send it.
   *
   * Called after the account is written, never inside the transaction that
   * writes it: this does its own write and sends an email, and neither should
   * be able to roll back an account that is already valid. A failure must not
   * fail the request either - the account exists, so reporting failure would
   * send the client back to retry and collect a 409 on its own email. The app
   * asks for another code at POST /api/verify-otp/resend.
   */
  private async issueCode(email: string) {
    try {
      await this.otp.issue(email, 'email_verification');
    } catch (error) {
      this.logger.error(
        `Account created but no verification code went out to ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Rejects an email or phone number already registered to an account. */
  private async assertAccountAvailable({
    email,
    phone,
  }: {
    email: string;
    phone: string;
  }) {
    const users = this.db.getRepository(User);

    const [byEmail, byPhone] = await Promise.all([
      users.findOne({ where: { email } }),
      users.findOne({ where: { phone } }),
    ]);

    if (byEmail) {
      throw new ConflictException('An account with that email already exists');
    }

    if (byPhone) {
      throw new ConflictException(
        'An account with that phone number already exists',
      );
    }
  }

  /** Rejects an email, phone or shop name that is already in use. */
  private async assertAvailable({
    email,
    phone,
    shopName,
  }: SetSellerProfileDto) {
    await this.assertAccountAvailable({ email, phone });

    const byShop = await this.db
      .getRepository(Seller)
      .findOne({ where: { shopName } });

    if (byShop) {
      throw new ConflictException('That shop name is already taken');
    }
  }

  /**
   * Turns a failed write into something the client can act on.
   *
   * A unique violation here means the check above was raced, so it is still
   * the client's problem to fix - a 409, not the 500 an unexpected failure
   * would give.
   */
  private explain(error: unknown) {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string })?.code === UNIQUE_VIOLATION
    ) {
      const detail = String(
        (error.driverError as { detail?: string })?.detail ?? '',
      );

      if (detail.includes('email')) {
        return new ConflictException(
          'An account with that email already exists',
        );
      }

      if (detail.includes('phone')) {
        return new ConflictException(
          'An account with that phone number already exists',
        );
      }

      return new ConflictException('That shop name is already taken');
    }

    // Anything else is a 500 from the filter, and `saved` is never returned.
    this.logger.error(error instanceof Error ? error.stack : String(error));

    return error;
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
