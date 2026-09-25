import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ActivityService } from './activity.service';
import { BuyersService } from './buyers.service';
import { DashboardService } from './dashboard.service';
import { ListingsService } from './listings.service';
import { SellersService } from './sellers.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, Product, Seller]),
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    ActivityService,
    DashboardService,
    SellersService,
    BuyersService,
    ListingsService,
  ],
})
export class AdminModule {}
