import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { roleVariants } from '../common/constants/domain';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  /**
   * The four totals on the dashboard's first tab.
   *
   * Buyers and sellers are counted by the role on the user row, so the three
   * user figures always add up (buyers + sellers + admins = total). Rows
   * written before roles were settled on uppercase are matched too, via
   * roleVariants.
   *
   * A listing is a product row; every one is counted regardless of approval
   * state, so this is the whole catalogue rather than what buyers can see.
   */
  async totals() {
    const [totalUsers, totalSellers, totalBuyers, totalListings] =
      await Promise.all([
        this.users.count(),
        this.users.count({ where: { role: In(roleVariants('SELLER')) } }),
        this.users.count({ where: { role: In(roleVariants('BUYER')) } }),
        this.products.count(),
      ]);

    return {
      message: 'Dashboard totals retrieved',
      data: { totalUsers, totalSellers, totalBuyers, totalListings },
    };
  }
}
