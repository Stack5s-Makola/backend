import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { AdminLoginDto } from './dto';

/**
 * The `sub` claim for the super admin.
 *
 * Every other token in this API carries a user row's id. This one has no row
 * behind it, so it gets a fixed sentinel instead of an id that resolves to
 * nothing. Anything that later loads a user from `sub` must expect it.
 */
export const SUPER_ADMIN_ID = 'super-admin';

/** Length-safe comparison, so a wrong password cannot be timed character by character. */
function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class AdminService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Checks a submitted email and password against the single super admin
   * credential held in the environment, and issues an access token.
   *
   * Access token only: there is no refresh token and nothing is persisted, so
   * when the token expires the admin logs in again.
   */
  async login({ email, password }: AdminLoginDto) {
    const expectedEmail = this.config.get<string>('SUPER_ADMIN_EMAIL');
    const expectedPassword = this.config.get<string>('SUPER_ADMIN_PASSWORD');

    // A half-configured deployment is a server fault, not a bad request:
    // without both values every login below would fail as "wrong email".
    if (!expectedEmail || !expectedPassword) {
      throw new InternalServerErrorException(
        'Super admin credentials are not configured',
      );
    }

    // Without a secret every token minted here would be unverifiable, so fail
    // loudly now rather than at the first guarded request.
    if (!this.config.get<string>('JWT_SECRET')) {
      throw new InternalServerErrorException('JWT_SECRET is not configured');
    }

    // The DTO already lower-cased and trimmed the submitted address; do the
    // same to the configured one so casing in .env cannot lock the admin out.
    if (!matches(email, expectedEmail.trim().toLowerCase())) {
      throw new UnauthorizedException('No admin account found for that email');
    }

    if (!matches(password, expectedPassword)) {
      throw new UnauthorizedException('Incorrect password');
    }

    const payload: JwtPayload = {
      sub: SUPER_ADMIN_ID,
      email,
      role: 'ADMIN',
    };

    return {
      message: 'Login successful',
      data: {
        // Signed with JWT_SECRET and the JWT_ACCESS_EXPIRES_IN lifetime that
        // CommonModule registers JwtModule with.
        accessToken: await this.jwt.signAsync(payload),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
        admin: { email, role: payload.role },
      },
    };
  }
}
