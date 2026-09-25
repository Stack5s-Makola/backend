import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { roleVariants } from '../common/constants/domain';
import { User } from '../users/entities/user.entity';

/** One row of the admin buyers table. */
export interface BuyerRow {
  id: string;
  /** From users.fullName. */
  name: string | null;
  email: string;
  phone: string | null;
  /** From users.avatarUrl. */
  profilePicture: string | null;
  /** When they signed up, as an ISO timestamp. */
  joined: string;
  /** Whether they confirmed their email address. */
  isEmailVerified: boolean;
  status: string;
}

@Injectable()
export class BuyersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** Every buyer, newest first. */
  async list() {
    const buyers = await this.users.find({
      where: { role: In(roleVariants('BUYER')) },
      order: { createdAt: 'DESC' },
      // Named explicitly to keep passwordHash out of the response.
      select: {
        id: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        fullName: true,
        avatarUrl: true,
        emailVerified: true,
      },
    });

    return {
      message: 'Buyers retrieved',
      data: buyers.map((buyer) => ({
        id: buyer.id,
        name: buyer.fullName ?? null,
        email: buyer.email,
        phone: buyer.phone ?? null,
        profilePicture: buyer.avatarUrl ?? null,
        joined: buyer.createdAt.toISOString(),
        isEmailVerified: buyer.emailVerified ?? false,
        status: buyer.status,
      })) satisfies BuyerRow[],
    };
  }
}
