import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DashboardService } from './dashboard.service';
import { SellersService } from './sellers.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User, Product, Seller])],
  controllers: [AdminController],
  providers: [AdminService, DashboardService, SellersService],
})
export class AdminModule {}
