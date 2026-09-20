import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User, Product])],
  controllers: [AdminController],
  providers: [AdminService, DashboardService],
})
export class AdminModule {}
