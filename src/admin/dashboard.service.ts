import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { roleVariants } from '../common/constants/domain';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { ActivityService } from './activity.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly activity: ActivityService,
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
   *
   * The recent activity feed rides along on the same response, so the first
   * tab loads in one request.
   */
  async totals() {
    const [totalUsers, totalSellers, totalBuyers, totalListings, recent] =
      await Promise.all([
        this.users.count(),
        this.users.count({ where: { role: In(roleVariants('SELLER')) } }),
        this.users.count({ where: { role: In(roleVariants('BUYER')) } }),
        this.products.count(),
        this.activity.recent(),
      ]);

    return {
      message: 'Dashboard totals retrieved',
      data: {
        totalUsers,
        totalSellers,
        totalBuyers,
        totalListings,
        recentActivities: recent,
      },
    };
  }
}
