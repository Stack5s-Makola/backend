import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { SavedProduct } from '../saved/entities/SavedProduct.entity';
import { SavedSeller } from '../saved/entities/SavedSeller.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { User } from '../users/entities/user.entity';
import { BuyerController } from './buyer.controller';
import { BuyerService } from './buyer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      SavedProduct,
      SavedSeller,
      User,
      Seller,
    ]),
  ],
  controllers: [BuyerController],
  providers: [BuyerService],
})
export class BuyerModule {}
