import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Report } from './entities/Reports.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Seller, Product, Report])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
