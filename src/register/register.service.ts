import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DataSource, QueryFailedError } from 'typeorm';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { OtpService } from '../otp/otp.service';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { SetSellerProfileDto } from './dto';

/** Postgres: unique_violation. */
const UNIQUE_VIOLATION = '23505';

/** Matches the auth module, so hashes stay comparable across both. */
const SALT_ROUNDS = 10;

@Injectable()
export class RegisterService {
  private readonly logger = new Logger(RegisterService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates a seller in one step: the account, its hashed password and the
   * shop row, then emails a verification code.
   *
   * The writes happen in one transaction, so a failure part way through
   * cannot leave an account with no shop, or a shop with no account. The code
   * is sent after it commits - see the note on that call below.
   */
  async setSellerProfile(dto: SetSellerProfileDto) {
    const { email, phone, password, shopName, location, role } = dto;

    // Checked up front so the client gets a clear message rather than a
    // constraint error. The unique indexes below are still what guarantees it:
    // two requests racing here would both pass this check.
    await this.assertAvailable(dto);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let userId: string;

    try {
      userId = await this.db.transaction(async (manager) => {
        const { identifiers } = await manager.insert(User, {
          email,
          phone,
          passwordHash,
          role,
        });

        const id = (identifiers[0] as { id: string }).id;

        await manager.insert(Seller, {
          userId: id,
          shopName,
          latitude: location.latitude,
          longitude: location.longitude,
        });

        return id;
      });
    } catch (error) {
      throw this.explain(error);
    }

    // After the commit, and deliberately not inside it: issuing a code writes
    // its own row and sends an email, and neither should be able to roll back
    // an account that is already valid.
    //
    // A failure here must not fail the request either. The account exists, so
    // reporting failure would send the client back to retry and collect a 409
    // on its own email. The app asks for another code at POST /api/otp.
    try {
      await this.otp.issue(email, 'email_verification');
    } catch (error) {
      this.logger.error(
        `Account created but no verification code went out to ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    // Signed here so the app is logged in straight after sign-up, rather than
    // having to post the password again. Note the account is not verified
    // yet: the token says who they are, not that their email is confirmed.
    const payload: JwtPayload = { sub: userId, email, role };

    return {
      message:
        'Seller profile created. Check your email for a verification code.',
      data: {
        saved: true,
        accessToken: await this.jwt.signAsync(payload),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
        user: { id: userId, email, role, emailVerified: false },
      },
    };
  }

  /** Rejects an email, phone or shop name that is already in use. */
  private async assertAvailable({
    email,
    phone,
    shopName,
  }: SetSellerProfileDto) {
    const [byEmail, byPhone, byShop] = await Promise.all([
      this.db.getRepository(User).findOne({ where: { email } }),
      this.db.getRepository(User).findOne({ where: { phone } }),
      this.db.getRepository(Seller).findOne({ where: { shopName } }),
    ]);

    if (byEmail) {
      throw new ConflictException('An account with that email already exists');
    }

    if (byPhone) {
      throw new ConflictException(
        'An account with that phone number already exists',
      );
    }

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
