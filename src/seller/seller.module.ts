import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/Categories.entity';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { User } from '../users/entities/user.entity';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Seller, Category, User]),
    UploadsModule,
    NotificationsModule,
  ],
  controllers: [SellerController],
  providers: [SellerService],
})
export class SellerModule {}
