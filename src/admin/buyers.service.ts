import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { roleVariants } from '../common/constants/domain';
import { User } from '../users/entities/user.entity';

/** One row of the admin buyers table. */
export interface BuyerRow {
  id: string;
  /**
   * From users.fullName, which is not a column yet, so this is null on every
   * row for now; `email` is the only human identifier the schema has today.
   * See documentation/pending-profile-fields.md.
   */
  name: string | null;
  email: string;
  phone: string | null;
  /** From users.avatarUrl - pending the same migration, so null for now. */
  profilePicture: string | null;
  /** When they signed up, as an ISO timestamp. */
  joined: string;
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
      // Named explicitly to keep passwordHash out of the response. Only real
      // columns may appear here: naming fullName or avatarUrl would put them
      // in the SQL and fail the query.
      select: {
        id: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
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
        status: buyer.status,
      })) satisfies BuyerRow[],
    };
  }
}
