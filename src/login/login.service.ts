import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { normaliseRole, USER_ROLES } from '../common/constants/domain';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { OtpService } from '../otp/otp.service';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto';

@Injectable()
export class LoginService {
  private readonly logger = new Logger(LoginService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Checks an email and password, then emails a one-time code.
   *
   * The password alone does not sign anyone in: this answers "are these
   * credentials good", and the code that follows is the second step.
   */
  async login({ email, password }: LoginDto) {
    const user = await this.users.findOne({ where: { email } });

    // One message for both a missing account and a wrong password. Saying
    // which it was tells anyone who asks whether an address is registered.
    // bcrypt still runs on a dummy hash when there is no row, so the reply
    // does not come back noticeably faster for an unknown address.
    const correct = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await this.burnTime(password);

    if (!user || !correct) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new ForbiddenException(
        `This account is ${user.status}. Please contact support`,
      );
    }

    // A failed send must not fail a good login: the credentials were right,
    // and the app can ask again at POST /api/verify-otp/resend.
    try {
      await this.otp.issue(user.email, 'login');
    } catch (error) {
      this.logger.error(
        `Signed in but no code went out to ${user.email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    // Rows written before roles settled on uppercase still normalise.
    // normaliseRole only upper-cases, so check the result is a role we know:
    // anything else becomes BUYER, the least an account can be, rather than
    // being minted into a token's `role` claim as it is.
    const claimed = normaliseRole(user.role);
    const role = claimed && USER_ROLES.includes(claimed) ? claimed : 'BUYER';

    // No expiry - see SessionTokenModule for why, and what it costs.
    const payload: JwtPayload = { sub: user.id, email: user.email, role };

    return {
      message: 'Signed in. Check your email for a verification code.',
      data: {
        accessToken: await this.jwt.signAsync(payload),
        email: user.email,
        role,
        emailVerified: user.emailVerified,
      },
    };
  }

  /** Spends about as long as a real comparison, and always fails. */
  private async burnTime(password: string) {
    await bcrypt.compare(
      password,
      '$2b$10$abcdefghijklmnopqrstuvwxyz012345678901234567890123456789',
    );

    return false;
  }
}
