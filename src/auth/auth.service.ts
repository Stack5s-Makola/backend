import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { normaliseRole } from '../common/constants/domain';
import type { JwtPayload } from '../common/guards/jwt-auth.guard';
import { OtpService } from '../otp/otp.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto';
import { VerifyOtpDto } from '../otp/dto';
import { RefreshToken } from './entities/RefreshTokens.entity';

/** The account shape every auth route returns. Never includes the hash. */
export interface PublicUser {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: Date;
}

const SALT_ROUNDS = 10;

/** How long a refresh token lives when REFRESH_EXPIRES_IN_DAYS is unset. */
const DEFAULT_REFRESH_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepository: Repository<RefreshToken>,
    private readonly otpService: OtpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates an account and emails a verification code.
   *
   * No token is issued here: the account is unverified until the code comes
   * back at POST /api/auth/verify-otp, which is what returns the first token.
   */
  async register(dto: RegisterDto) {
    // One query covers both: `email` is unique in the database, and a phone
    // number should only ever belong to one account even though the column
    // carries no constraint. 409 rather than the 500 a raw unique violation
    // would produce.
    const taken = await this.usersRepository.find({
      where: [{ email: dto.email }, { phone: dto.phone }],
      take: 2,
    });

    if (taken.some((user) => user.email === dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }

    if (taken.length) {
      throw new ConflictException(
        'An account with this phone number already exists',
      );
    }

    const user = await this.usersRepository.save(
      this.usersRepository.create({
        email: dto.email,
        phone: dto.phone,
        passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
        role: dto.role ?? 'BUYER',
        status: 'active',
        emailVerified: false,
      }),
    );

    const otp = await this.otpService.issue(user.email, 'email_verification');

    return {
      message: 'Account created. Check your email for a verification code',
      data: {
        user: this.toPublicUser(user),
        verification: {
          required: true,
          expiresAt: otp.expiresAt,
        },
      },
    };
  }

  /**
   * Exchanges an email and password for an access token.
   *
   * A missing account and a wrong password give the same answer, so the
   * endpoint cannot be used to find out which addresses are registered.
   */
  async login(dto: LoginDto) {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    const matches =
      user && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!user || !matches) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    this.assertUsable(user);

    if (!user.emailVerified) {
      // The app reads this code to send the user to the OTP screen
      throw new ForbiddenException({
        message: 'Please verify your email address before signing in',
        errors: { code: 'EMAIL_NOT_VERIFIED' },
      });
    }

    return {
      message: 'Signed in',
      data: this.withoutInternals(await this.session(user)),
    };
  }

  /**
   * Confirms a code from registration, marks the email verified and signs the
   * user in, so the app does not have to ask for the password again.
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    this.assertUsable(user);

    await this.otpService.verify(
      dto.email,
      dto.code,
      dto.purpose ?? 'email_verification',
    );

    if (!user.emailVerified) {
      user.emailVerified = true;
      await this.usersRepository.save(user);
    }

    return {
      message: 'Email verified',
      data: this.withoutInternals(await this.session(user)),
    };
  }

  /**
   * Trades a refresh token for a new pair.
   *
   * The presented token is rotated: it is revoked and a fresh one is issued
   * in its place, so a token is only ever usable once. Presenting a token
   * that was already spent means a copy is in circulation, and every token
   * the account holds is revoked in response.
   */
  async refresh(dto: RefreshTokenDto) {
    const stored = await this.refreshRepository.findOne({
      where: { tokenHash: this.hashToken(dto.refreshToken) },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Replay: whoever holds this also holds whatever replaced it
      await this.revokeAllFor(stored.userId);
      throw new UnauthorizedException(
        'This session has been ended. Please sign in again',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(
        'This session has expired. Please sign in again',
      );
    }

    const user = await this.usersRepository.findOne({
      where: { id: stored.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    this.assertUsable(user);

    const session = await this.session(user);

    stored.revokedAt = new Date();
    stored.replacedBy = session.refreshTokenId;
    await this.refreshRepository.save(stored);

    return {
      message: 'Session refreshed',
      data: this.withoutInternals(session),
    };
  }

  /**
   * Ends one session.
   *
   * Revoking an unknown or already-revoked token is not an error: logging out
   * twice, or with a token the server has forgotten, should still leave the
   * client signed out.
   */
  async logout(dto: RefreshTokenDto) {
    await this.refreshRepository.update(
      { tokenHash: this.hashToken(dto.refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    return { message: 'Signed out', data: null };
  }

  /** Drops expired rows. Safe to call from a scheduled job. */
  async purgeExpiredRefreshTokens(): Promise<number> {
    const { affected } = await this.refreshRepository.delete({
      expiresAt: LessThan(new Date()),
    });

    return affected ?? 0;
  }

  /** A suspended or soft-deleted account cannot hold a session. */
  private assertUsable(user: User) {
    if (user.status === 'suspended') {
      throw new ForbiddenException('This account has been suspended');
    }

    if (user.status === 'deleted') {
      throw new UnauthorizedException('Incorrect email or password');
    }
  }

  private async session(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      // The guards compare uppercase; rows written earlier may be lowercase
      role: normaliseRole(user.role) ?? 'BUYER',
    };

    const refreshToken = randomBytes(32).toString('hex');
    const days = Number(
      this.config.get<string>('REFRESH_EXPIRES_IN_DAYS') ??
        DEFAULT_REFRESH_DAYS,
    );
    const refreshExpiresAt = new Date(
      Date.now() +
        (Number.isFinite(days) ? days : DEFAULT_REFRESH_DAYS) * 86_400_000,
    );

    const stored = await this.refreshRepository.save(
      this.refreshRepository.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        revokedAt: null,
        replacedBy: null,
      }),
    );

    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      refreshToken,
      refreshExpiresAt,
      // Only for chaining a rotation; stripped before the response goes out
      refreshTokenId: stored.id,
      user: this.toPublicUser(user),
    };
  }

  /** The session minus the bookkeeping the client has no use for. */
  private withoutInternals(
    session: Awaited<ReturnType<AuthService['session']>>,
  ) {
    const rest = { ...session };
    delete (rest as Partial<typeof rest>).refreshTokenId;
    return rest;
  }

  private revokeAllFor(userId: string) {
    return this.refreshRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** SHA-256: fast, and the token has 256 bits of entropy to begin with. */
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone ?? null,
      role: normaliseRole(user.role) ?? 'BUYER',
      status: user.status,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }
}
