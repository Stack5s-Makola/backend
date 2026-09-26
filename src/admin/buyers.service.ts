import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { coordinates } from '../common/geo';
import { roleVariants } from '../common/constants/domain';
import { MapService } from '../map/map.service';
import { placeNames } from '../common/place-name';
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
  /** Where they are, as a place name. Null when they gave no coordinates. */
  location: string | null;
  /** The same name, under the name the mobile API uses. */
  locationName: string | null;
  /** The raw coordinates as well, for the dashboard's map. */
  coordinates: { latitude: number; longitude: number } | null;
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
    private readonly map: MapService,
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
        latitude: true,
        longitude: true,
        locationName: true,
      },
    });

    const names = await placeNames(this.map, this.users, buyers);

    return {
      message: 'Buyers retrieved',
      data: buyers.map((buyer) => ({
        id: buyer.id,
        name: buyer.fullName ?? null,
        email: buyer.email,
        phone: buyer.phone ?? null,
        profilePicture: buyer.avatarUrl ?? null,
        location: names.get(buyer.id) ?? null,
        locationName: names.get(buyer.id) ?? null,
        coordinates: coordinates(buyer),
        joined: buyer.createdAt.toISOString(),
        isEmailVerified: buyer.emailVerified ?? false,
        status: buyer.status,
      })) satisfies BuyerRow[],
    };
  }
}
