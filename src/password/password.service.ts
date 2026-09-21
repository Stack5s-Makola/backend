import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ResetPasswordDto } from './dto';

/** Matches the register and auth modules, so hashes stay comparable. */
const SALT_ROUNDS = 10;

@Injectable()
export class PasswordService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Replaces an account's password.
   *
   * Note what this does NOT ask for: the old password, a token, or a code.
   * The user id alone is enough, so anyone holding an id can take the
   * account over. See documentation/reset-password.md before this is exposed
   * to real users.
   */
  async reset({ userId, password }: ResetPasswordDto) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('No account found for that id');
    }

    await this.users.update(
      { id: userId },
      { passwordHash: await bcrypt.hash(password, SALT_ROUNDS) },
    );

    return {
      message: 'Password changed',
      data: { reset: true },
    };
  }
}
