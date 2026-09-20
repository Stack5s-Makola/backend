import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { AdminLoginDto } from './dto';

/** Length-safe comparison, so a wrong password cannot be timed character by character. */
function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class AdminService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Checks a submitted email and password against the single super admin
   * credential held in the environment.
   *
   * There is no admin row in the database yet, so this is the whole of admin
   * auth for now: no token is issued and nothing is persisted.
   */
  login({ email, password }: AdminLoginDto) {
    const expectedEmail = this.config.get<string>('SUPER_ADMIN_EMAIL');
    const expectedPassword = this.config.get<string>('SUPER_ADMIN_PASSWORD');

    // A half-configured deployment is a server fault, not a bad request:
    // without both values every login below would fail as "wrong email".
    if (!expectedEmail || !expectedPassword) {
      throw new InternalServerErrorException(
        'Super admin credentials are not configured',
      );
    }

    // The DTO already lower-cased and trimmed the submitted address; do the
    // same to the configured one so casing in .env cannot lock the admin out.
    if (!matches(email, expectedEmail.trim().toLowerCase())) {
      throw new UnauthorizedException('No admin account found for that email');
    }

    if (!matches(password, expectedPassword)) {
      throw new UnauthorizedException('Incorrect password');
    }

    return {
      message: 'Login successful',
      data: { email, role: 'ADMIN' as const },
    };
  }
}
